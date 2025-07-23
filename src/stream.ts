import { Request, Response } from "express";
import WebTorrent from "webtorrent";
import parseRange from "range-parser";
import { pipeline } from "stream";
import { spawn } from "child_process";
import fs from "fs";
import ffmpegPath from "ffmpeg-static";
import path from "path";
import * as cron from "node-cron";

// Enable verbose logging by starting the server with DEBUG_STREAM=1
function debug(...args: any[]) {
  if (process.env.DEBUG_STREAM === "1") console.log(...args);
}

// After a stream finishes we disconnect peers after a short idle window
const idleTimeoutMs = 2 * 60 * 1000;       // 2 min until we drop peer connections

// Where on disk to keep torrent data (override with env CACHE_DIR)
const CACHE_DIR = process.env.CACHE_DIR || path.join(process.cwd(), "cache");
fs.mkdirSync(CACHE_DIR, { recursive: true });

// Track idle timers to prevent duplicates per infoHash
const idleTimers = new Map<string, NodeJS.Timeout>();

// Extra open trackers to accelerate peer discovery
const EXTRA_TRACKERS = [
  "udp://tracker.openbittorrent.com:6969/announce",
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://tracker.moeking.me:6969/announce",
];

// WebTorrent client with more aggressive defaults for faster piece acquisition
const client = new WebTorrent({
  maxConns: 200,      // default is 55 – raise the ceiling for healthy seeds
  dht: true,
  tracker: { announce: EXTRA_TRACKERS },
});

// Schedule daily cache cleanup at 3am
cron.schedule('0 3 * * *', () => {
  console.log('🧹 Running daily cache cleanup at 3am...');
  wipeAllCacheFiles();
}, {
  timezone: "Europe/London" // UK timezone
});

function wipeAllCacheFiles() {
  try {
    // First, destroy all active torrents to release file handles
    client.torrents.forEach((t: any) => {
      try {
        t.destroy({ destroyStore: true });
        debug(`[cleanup] Destroyed active torrent ${t.infoHash}`);
      } catch (e) {
        console.error("Error destroying active torrent during cleanup", e);
      }
    });

    // Then remove all files from cache directory
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR, { withFileTypes: true });
      let deletedCount = 0;
      let totalSize = 0;

      for (const file of files) {
        const filePath = path.join(CACHE_DIR, file.name);
        try {
          if (file.isDirectory()) {
            // Recursively remove directories
            const stats = fs.statSync(filePath);
            totalSize += stats.size;
            fs.rmSync(filePath, { recursive: true, force: true });
            deletedCount++;
          } else {
            // Remove files
            const stats = fs.statSync(filePath);
            totalSize += stats.size;
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        } catch (err) {
          console.error(`Error deleting ${filePath}:`, err);
        }
      }

      const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
      console.log(`🧹 Cache cleanup complete: deleted ${deletedCount} items, freed ${sizeMB}MB`);
    }

    // Clear any remaining timers
    idleTimers.clear();
  } catch (err) {
    console.error("Error during cache cleanup:", err);
  }
}

// NEW: expose client so other modules (e.g., API routes) can read torrent stats
export function getClient() {
  return client;
}

const VIDEO_EXT = /\.(mp4|mkv|webm|avi)$/i;

// Helper to check query flag (presence = true)
function flagEnabled(val: any) {
  if (val === undefined) return false;
  if (typeof val === "string") return val === "1" || val.toLowerCase() === "true";
  return !!val;
}

export async function streamTorrent(req: Request, res: Response) {
  const magnet = (req.query.magnet as string) || "";
  const transcodeForced = flagEnabled(req.query.transcode);
  const requestedStart = parseInt((req.query.start as string) || "0", 10);

  debug(`[stream] Request received – magnet len=${magnet.length}, transcode=${transcodeForced}, start=${requestedStart}`);
  if (!magnet) {
    return res.status(400).json({ error: "magnet query param required" });
  }

  // Stop any other active torrents so the new request gets full bandwidth.
  client.torrents.forEach((t: any) => {
    if (t.magnetURI !== magnet) {
      try {
        debug(`[stream] Stopping previous torrent ${t.infoHash}`);
        scheduleCleanup(t); // disconnect but keep files until 3am cleanup
      } catch {}
    }
  });

  let torrent = client.get(magnet);
  if (!torrent) {
    try {
      torrent = client.add(magnet, { path: CACHE_DIR });
      debug(`[stream] Adding new torrent ${magnet.substring(0, 60)}…`);
    } catch (e) {
      console.error("Error adding torrent", e);
      return res.status(500).json({ error: "Failed to add torrent" });
    }
  } else {
    debug(`[stream] Reusing existing torrent ${torrent.infoHash}`);
  }

  torrent.on("error", (err: any) => console.error("Torrent error", err));

  // Wait until metadata is ready to select file
  if (!torrent.ready) {
    debug(`[stream] Waiting for metadata…`);
    await new Promise<void>((resolve) => torrent.once("ready", () => resolve()));
  }

  debug(`[stream] Torrent ready – ${torrent.files.length} files available`);

  // NOTE: We used to enable sequential priority for the entire torrent, but that
  // caused huge backlogs when the user seeks far ahead (old pieces were still
  // in the queue). Instead we rely on the `file.createReadStream()` smart
  // selector plus the targeted head/tail pre-select below.

  // Prefer browser-friendly formats first (mp4 > webm > mkv > avi),
  // and within the same format pick the largest file. This improves
  // the chances that the selected video has an audio track the browser can play.
  const formatPriority = [".mp4", ".webm", ".mkv", ".avi"];

  const videoFiles = torrent.files.filter((f: any) => VIDEO_EXT.test(f.name));

  videoFiles.sort((a: any, b: any) => {
    const extA = formatPriority.findIndex((ext) => a.name.toLowerCase().endsWith(ext));
    const extB = formatPriority.findIndex((ext) => b.name.toLowerCase().endsWith(ext));

    // Unknown extensions get lowest priority (pushed to the end)
    const priA = extA === -1 ? formatPriority.length : extA;
    const priB = extB === -1 ? formatPriority.length : extB;

    if (priA !== priB) return priA - priB; // lower index = higher priority

    // Same format – choose the larger file
    return b.length - a.length;
  });

  const file = videoFiles[0];

  if (file) {
    // Pre-select head (first 4 MB) and tail (last 1 MB) so that
    // the browser can obtain initial samples and the MP4 moov atom quickly.
    const HEAD_BYTES = 4 * 1024 * 1024;
    const TAIL_BYTES = 1 * 1024 * 1024;
    try {
      file.select(0, Math.min(file.length - 1, HEAD_BYTES));
      file.select(Math.max(0, file.length - TAIL_BYTES), file.length - 1);
      debug(`[stream] Pre-selected head/tail bytes for fast start`);
    } catch (err) {
      debug("[stream] Head/tail select error", err);
    }
  }

  if (file) {
    debug(`[stream] Selected file "${file.name}" (${file.length} bytes)`);
  } else {
    console.warn(`[stream] No suitable video file found`);
  }

  // Decide whether to transcode: forced via query OR auto for non-playable containers
  // --- Browser-specific compatibility -------------------------------------
  // Safari (both macOS & iOS) still cannot play WebM in a <video> element.  
  // We therefore consider ONLY MP4 containers natively playable for Safari, 
  // whereas Chrome/Edge/Firefox can handle both MP4 and WebM.  To avoid
  // wasting CPU we detect Safari via the User-Agent header and switch the
  // playable-container test accordingly.
  const ua = String(req.headers["user-agent"] || "");
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua);

  const isPlayableContainer = isSafari
    ? /\.mp4$/i.test(file.name)            // Safari: MP4 only
    : /\.(mp4|webm)$/i.test(file.name);    // Others: MP4 or WebM
  const shouldTranscode = transcodeForced || !isPlayableContainer;

  // Prefetch next few minutes worth of data to speed up seek / startup when transcoding
  if (shouldTranscode) {
    const EST_DURATION_SEC = 3600; // assume 1-hour video if actual duration unknown
    const PREFETCH_SEC = 60; // fetch ~1 minute worth of data – faster initial frame

    const bytesPerSec = file.length / EST_DURATION_SEC;
    const prefetchStartByte = Math.max(0, Math.floor(bytesPerSec * requestedStart));
    const prefetchEndByte = Math.min(file.length - 1, prefetchStartByte + Math.floor(bytesPerSec * PREFETCH_SEC));

    try {
      file.select(prefetchStartByte, prefetchEndByte);

      // Give very high priority to the prefetch window so it arrives quickly
      const pieceLen = torrent.pieceLength;
      const criticalStartPiece = Math.floor(prefetchStartByte / pieceLen);
      const criticalEndPiece = Math.floor(prefetchEndByte / pieceLen);
      torrent.critical(criticalStartPiece, criticalEndPiece);
      debug(`[stream] Marked pieces ${criticalStartPiece}-${criticalEndPiece} critical for prefetch`);
    } catch (err) {
      debug(`[stream] Prefetch error`, err);
    }
  }

  debug(`[stream] Auto decision – isPlayable=${isPlayableContainer}, forced=${transcodeForced} => transcode=${shouldTranscode}`);

  if (!file) {
    return res.status(404).json({ error: "No video file found in torrent" });
  }

  const total = file.length;
  const rangeHeader = req.headers.range;
  const pipeVideo = (start?: number, end?: number) => {
    let ff: any = null;
    const streamOpts = start !== undefined && end !== undefined ? { start, end } : undefined;
    const src = file.createReadStream(streamOpts);

    // Ensure cleanup when the client disconnects prematurely (e.g., user closes the video)
    const onClientClose = () => {
      debug("[stream] Client closed connection – cleaning up streams");
      try { src.destroy(); } catch {}
      if (ff) {
        try { ff.kill("SIGKILL"); } catch {}
      }
      scheduleCleanup(torrent!);
    };
    res.once("close", onClientClose);

    if (shouldTranscode) {
      // ffmpeg – copy video, transcode audio -> aac
      const ffmpegCmd = ffmpegPath || "ffmpeg";

      debug(`[stream] Spawning ffmpeg (${ffmpegCmd}) – audio->aac, video copy`);

      try {
        const ffArgs: string[] = ["-i", "pipe:0"];
        if (requestedStart > 0) {
          // Accurate seek within stream (may decode up to timestamp). Works with growing file via stdin.
          ffArgs.push("-ss", requestedStart.toString());
        }

        const stdioOption: ("pipe"|"inherit")[] = ["pipe", "pipe", "inherit"];

        ffArgs.push(
          "-c:v", "copy",
          "-c:a", "aac",
          "-f", "mp4",
          "-movflags", "frag_keyframe+empty_moov",
          "pipe:1",
        );

        ff = spawn(ffmpegCmd, ffArgs, { stdio: stdioOption });

        // Always pipe torrent data into ffmpeg stdin
        src.pipe(ff.stdin);

        ff.on("close", (code: number, sig: string) => {
          debug(`[stream] ffmpeg exited code=${code} signal=${sig}`);
        });

        try {
          pipeline(ff.stdout, res, (err: any) => {
            if (err && err.code !== "ECONNRESET" && err.code !== "EPIPE" && err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
              console.error("Stream pipeline error", err);
            }
            debug(`[stream] Pipeline completed (transcoded)`);
            res.removeListener("close", onClientClose);
            if (ff) {
              try { ff.kill("SIGKILL"); } catch {}
            }
            scheduleCleanup(torrent!);
          });
        } catch (err: any) {
          if (err.code === "ERR_STREAM_UNABLE_TO_PIPE") {
            console.error("Pipeline setup error (transcoded)", err);
          } else {
            throw err;
          }
        }

        ff.on("error", (e: any) => console.error("ffmpeg error", e));
      } catch (e: any) {
        if (e.code === "ENOENT") {
          console.warn("ffmpeg not found – streaming without transcoding");
          try {
            pipeline(src, res, (err: any) => {
              if (err && err.code !== "ECONNRESET" && err.code !== "EPIPE" && err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
                console.error("Stream pipeline error", err);
              }
              debug(`[stream] Pipeline completed (no ffmpeg fallback)`);
              res.removeListener("close", onClientClose);
              scheduleCleanup(torrent!);
            });
          } catch (err: any) {
            if (err.code === "ERR_STREAM_UNABLE_TO_PIPE") {
              console.error("Pipeline setup error (no ffmpeg)", err);
            } else {
              throw err;
            }
          }
        } else {
          throw e;
        }
      }
    } else {
      try {
        pipeline(src, res, (err: any) => {
          if (err && err.code !== "ECONNRESET" && err.code !== "EPIPE" && err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
            console.error("Stream pipeline error", err);
          }
          debug(`[stream] Pipeline completed (direct)`);
          res.removeListener("close", onClientClose);
          scheduleCleanup(torrent!);
        });
      } catch (err: any) {
        if (err.code === "ERR_STREAM_UNABLE_TO_PIPE") {
          console.error("Pipeline setup error (direct)", err);
        } else {
          throw err;
        }
      }
    }
  };

  if (rangeHeader) {
    if (shouldTranscode) {
      // Disable range when transcoding – we don't know final size ahead of time.
      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Transfer-Encoding": "chunked",
      });
      pipeVideo();
    } else {
      const ranges = parseRange(total, rangeHeader, { combine: true });
      if (ranges === -1 || ranges === -2 || !Array.isArray(ranges)) {
        return res.status(416).end();
      }
      const { start, end } = ranges[0];

      // Before marking the new window critical, clear any previous low-priority
      // selections so the queue stays focused on the seek target.
      try {
        torrent.deselect(0, torrent.pieces.length - 1, 0);
      } catch {}

      // Mark pieces around the seek position as critical so peers deliver them first
      try {
        const pieceLen = torrent.pieceLength;
        const CRITICAL_BYTES = 2 * 1024 * 1024; // 2 MB window following the seek position
        const criticalStartByte = start;
        const criticalEndByte = Math.min(total - 1, start + CRITICAL_BYTES);
        const criticalStartPiece = Math.floor(criticalStartByte / pieceLen);
        const criticalEndPiece = Math.floor(criticalEndByte / pieceLen);
        torrent.critical(criticalStartPiece, criticalEndPiece);
        debug(`[stream] Marked pieces ${criticalStartPiece}-${criticalEndPiece} critical for seek`);
      } catch (err) {
        debug("[stream] Critical piece mark error", err);
      }
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": getMimeType(file.name),
      });
      pipeVideo(start, end);
    }
  } else {
    if (shouldTranscode) {
      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Transfer-Encoding": "chunked",
      });
      pipeVideo();
    } else {
      res.writeHead(200, {
        "Content-Length": total,
        "Content-Type": getMimeType(file.name),
        "Accept-Ranges": "bytes",
      });
      pipeVideo();
    }
  }
  // cancel any scheduled cleanup since we are actively streaming
  if (idleTimers.has(torrent.infoHash)) {
    clearTimeout(idleTimers.get(torrent.infoHash)!);
    idleTimers.delete(torrent.infoHash);
  }
}

export function purgeAllTorrents() {
  console.log("Purging all active torrents…", client.torrents.length);
  client.torrents.forEach((t: any) => {
    try {
      t.destroy({ destroyStore: true });
      console.log(`Destroyed torrent ${t.infoHash}`);
    } catch (e) {
      console.error("Error destroying torrent", e);
    }
  });
  idleTimers.clear();
}

// Export the cache cleanup function so it can be called manually if needed
export { wipeAllCacheFiles };

// ----------------------------------------------------------
//  Idle-&-retention helpers
// ----------------------------------------------------------

function scheduleCleanup(torrent: any) {
  if (idleTimers.has(torrent.infoHash)) return;
  const timer = setTimeout(() => {
    // The retention logic is now handled by the cron job, so this just disconnects peers.
    try {
      torrent.deselect(0, torrent.pieces.length - 1, 0);
      debug(`[stream] Disconnected torrent ${torrent.infoHash} – data retained`);
    } catch {}
    idleTimers.delete(torrent.infoHash);
  }, idleTimeoutMs);
  idleTimers.set(torrent.infoHash, timer);
}

function getMimeType(name: string) {
  if (name.endsWith(".mp4")) return "video/mp4";
  if (name.endsWith(".mkv")) return "video/x-matroska";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".avi")) return "video/x-msvideo";
  return "application/octet-stream";
} 