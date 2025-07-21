import { useEffect, useRef, useState } from "react";
import "./FullscreenPlayer.css";

interface FullscreenPlayerProps {
  src: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onTimeUpdate?: (currentTime: number) => void;
  onEnded?: () => void;
  initialTime?: number;
  runtime?: number; // Runtime in minutes from TMDB
  torrentOptions?: import("./api").TorrentOption[]; // NEW prop for available qualities
}

export default function FullscreenPlayer({
  src,
  title,
  subtitle,
  onClose,
  onTimeUpdate,
  onEnded,
  initialTime = 0,
  runtime,
  torrentOptions
}: FullscreenPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [offsetSeconds, setOffsetSeconds] = useState(0); // how many seconds from original timeline current clip starts
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false); // settings menu visibility
  const [currentOption, setCurrentOption] = useState<import("./api").TorrentOption | null>(null);

  // Buffering & progress UI state
  const [bufferPct, setBufferPct] = useState(0);
  const [bufferSpeed, setBufferSpeed] = useState(0);
  const [bufferPeers, setBufferPeers] = useState(0);
  const [loadingStart, setLoadingStart] = useState<number | null>(null);
  const [showSwitchPrompt, setShowSwitchPrompt] = useState(false);
  const progressIntervalRef = useRef<NodeJS.Timeout>();
  const resumeReloadedRef = useRef(false);
  
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout>();

  // Run-once initialisation for resume seeking. The effect still re-installs
  // event listeners when other deps change, but it must not re-apply the
  // initial `currentTime` seek on every re-run (e.g. when `isPlaying` or
  // `isLoading` toggles). We track whether the seek has been applied via a
  // ref so it happens only the very first time we mount the player for a
  // given `src`.
  const resumeAppliedRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!resumeAppliedRef.current && initialTime > 0) {
      // We can't reliably set currentTime until metadata is available, but some
      // browsers still accept the assignment here. We'll re-apply the seek in
      // `handleLoadedData` just to be safe.
      try {
        video.currentTime = initialTime;
      } catch {}
      setCurrentTime(initialTime); // don't touch offsetSeconds yet
      resumeAppliedRef.current = true; // ensure we don't run this block again
    }

    const handleLoadedData = () => {
      setIsLoading(false);
      // Use runtime from TMDB if available, otherwise fall back to video duration
      const actualDuration = runtime ? runtime * 60 : video.duration;
      setDuration(actualDuration);

      // Re-apply resume position once metadata is ready. If that still fails
      // (e.g. transcoded stream without range support), fall back to reloading
      // the stream with ?start=X so the server delivers the correct clip.
      if (initialTime > 0 && !resumeReloadedRef.current) {
        const rel = Math.max(0, initialTime - offsetSeconds);
        try {
          video.currentTime = rel;
          setCurrentTime(initialTime);
        } catch {}

        // Give the browser a brief tick to apply the seek, then verify.
        setTimeout(() => {
          const delta = Math.abs(video.currentTime - rel);
          if (delta > 1) {
            // Native seek failed – reload with start param.
            const newSrc = buildSrcWithStart(initialTime);
            resumeReloadedRef.current = true;
            setOffsetSeconds(initialTime);
            setCurrentTime(initialTime); // reflect immediately in UI while buffering
            const wasPaused = video.paused;
            video.src = newSrc;
            video.load();
            if (!wasPaused) {
              video.addEventListener("canplay", () => {
                video.play().catch(() => {});
              }, { once: true });
            }
            setIsPlaying(!wasPaused);
          }
        }, 200);
      }
    };

    const handleTimeUpdate = () => {
      // While buffering, or until we have successfully aligned the stream with
      // the requested resume offset, suppress updates so the UI doesn’t show
      // misleading timestamps.
      if (isLoading || (initialTime > 0 && offsetSeconds === 0)) return;
      const total = offsetSeconds + video.currentTime;
      setCurrentTime(total);
      onTimeUpdate?.(total);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    const handleLoadStart = () => {
      setIsLoading(true);
      setLoadingStart(Date.now());
      setShowSwitchPrompt(false);
    };
    const handleCanPlay = () => setIsLoading(false);

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('canplay', handleCanPlay);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, [initialTime, onTimeUpdate, onEnded, offsetSeconds, src, isPlaying, isLoading]);

  // Keep isPlaying state in sync with the media element itself. This catches
  // cases where the browser temporarily pauses during a seek or network
  // buffering and then resumes playback automatically (e.g. after scrubbing),
  // which previously left the UI out of sync.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      // Sync scrubber with the precise pause position
      const ct = video.currentTime;
      if (!isNaN(ct)) {
        setCurrentTime(offsetSeconds + ct);
      }
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [offsetSeconds]);

  useEffect(() => {
    // Hide controls after 3 seconds of inactivity
    const resetHideTimer = () => {
      setShowControls(true);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
      hideControlsTimeoutRef.current = setTimeout(() => {
        if (isPlaying) setShowControls(false);
      }, 3000);
    };

    resetHideTimer();
    
    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, [isPlaying]);

  useEffect(() => {
    // When src changes externally, attempt to track the matching torrent option
    if (!torrentOptions || torrentOptions.length === 0) return;
    const magnetParam = (() => {
      try {
        const url = new URL(src);
        return url.searchParams.get("magnet") || "";
      } catch {
        return "";
      }
    })();
    const match = torrentOptions.find((t) => t.magnet === magnetParam);
    if (match) setCurrentOption(match);
  }, [src, torrentOptions]);

  const qualityRank = (q?: string) => {
    if (!q) return 99;
    const qq = q.toUpperCase();
    if (qq.includes("2160") || qq.includes("4K")) return 0;
    if (qq.includes("1080")) return 1;
    if (qq.includes("720")) return 2;
    return 3;
  };

  const sortedOptions = (torrentOptions || []).slice().sort((a, b) => {
    const rd = qualityRank(a.quality) - qualityRank(b.quality);
    if (rd !== 0) return rd;
    return (b.ratio || 0) - (a.ratio || 0);
  });

  const lowerOption = sortedOptions.find((opt) => qualityRank(opt.quality) > qualityRank(currentOption?.quality)) || null;

  // Helper to format download speed
  const formatSpeed = (bytes: number) => {
    if (!bytes) return "0 KB/s";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
    const kb = bytes / 1024;
    return `${kb.toFixed(0)} KB/s`;
  };

  // Poll buffering progress while loading
  useEffect(() => {
    if (!isLoading) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = undefined;
      }
      return;
    }

    const magnet = (() => {
      try {
        const u = new URL(src);
        return u.searchParams.get("magnet") || "";
      } catch {
        return "";
      }
    })();
    if (!magnet) return;

    const poll = async () => {
      try {
        const res = await fetch(`http://localhost:3000/torrent/progress?magnet=${encodeURIComponent(magnet)}`);
        if (!res.ok) return;
        const data = await res.json();
        const pct = Math.round(((data.fileProgress ?? data.progress ?? 0) * 100));
        setBufferPct(pct);
        setBufferSpeed(data.speed || 0);
        setBufferPeers(data.peers || 0);

        if (loadingStart && Date.now() - loadingStart > 25000 && pct < 5 && lowerOption) {
          setShowSwitchPrompt(true);
        }
      } catch {}
    };

    poll();
    progressIntervalRef.current = setInterval(poll, 2000);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [isLoading, src, loadingStart, lowerOption]);

  const switchQuality = (opt: import("./api").TorrentOption) => {
    if (!opt.magnet) return;
    const video = videoRef.current;
    if (!video) return;

    // Capture current state before switching
    const wasPaused = video.paused;
    const preserveTime = currentTime; // Use the tracked currentTime which includes offset
    
    // Build new URL with current time to preserve playback position
    const baseSrc = `http://localhost:3000/stream?magnet=${encodeURIComponent(opt.magnet)}`;
    const newSrc = preserveTime > 0 ? 
      `${baseSrc}&start=${Math.floor(preserveTime)}` : 
      baseSrc;
    
    // Switch to new source
    video.src = newSrc;
    video.load();
    
    // Update offset to reflect the new starting position
    if (preserveTime > 0) {
      setOffsetSeconds(preserveTime);
    }
    
    // Properly handle play/pause state
    if (!wasPaused) {
      video.addEventListener("canplay", () => {
        video.play().catch(() => {});
      }, { once: true });
    }
    
    // Update state to match actual playback state
    setIsPlaying(!wasPaused);
    setCurrentOption(opt);
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const buildSrcWithStart = (t: number) => {
    const base = src.replace(/([&?])start=\d+/, "");
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}start=${Math.floor(t)}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const sliderVal = parseFloat(e.target.value);
    if (isNaN(sliderVal)) return;

    const targetTime = (sliderVal / 100) * duration;

    // Calculate time relative to the beginning of the **current clip**. If the
    // video element already starts at an offset (e.g. after a quality switch or
    // resume), we need to subtract that offset when performing a native seek.
    const relativeTarget = targetTime - offsetSeconds;

    // Inspect current seekable range before deciding how to jump.
    const seekable = video.seekable;

    const withinCurrentClip =
      relativeTarget >= 0 &&
      seekable.length > 0 &&
      relativeTarget <= seekable.end(seekable.length - 1) - 0.5; // 0.5 s tolerance

    // Attempt native seek first only if the timestamp is already buffered /
    // supported by the existing clip; otherwise we’ll reload a new clip.
    if (withinCurrentClip) {
      try {
        video.currentTime = relativeTarget;
        setCurrentTime(targetTime);
        return; // seek handled locally
      } catch {}
    }
 
    // If we reach here, we need to request a fresh clip starting at the desired
    // timestamp (either earlier or further ahead of the current clip).
    if (seekable.length === 0 || !withinCurrentClip) {
      const newSrc = buildSrcWithStart(targetTime);
      const wasPaused = video.paused;
      video.src = newSrc;
      video.load();
      if (!wasPaused) {
        video.addEventListener('canplay', () => {
          video.play().catch(()=>{});
        }, { once: true });
      }
      setIsPlaying(!wasPaused ? true : false);
      setOffsetSeconds(targetTime);
    }
 
    setCurrentTime(targetTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    const newVolume = parseFloat(e.target.value) / 100;
    
    if (!video) return;
    
    video.volume = newVolume;
    setVolume(newVolume);
    
    if (newVolume === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isMuted) {
      video.volume = volume > 0 ? volume : 0.5;
      setIsMuted(false);
    } else {
      video.volume = 0;
      setIsMuted(true);
    }
  };

  const formatTime = (time: number) => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    hideControlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePlayPause();
        break;
      case 'Escape':
        onClose();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setVolume(prev => Math.min(1, prev + 0.1));
        if (videoRef.current) videoRef.current.volume = Math.min(1, volume + 0.1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setVolume(prev => Math.max(0, prev - 0.1));
        if (videoRef.current) videoRef.current.volume = Math.max(0, volume - 0.1);
        break;
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [volume, duration, isPlaying]);

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Volume icon SVGs
  const VolumeOffIcon = () => (
    <svg className="volume-icon" viewBox="0 0 24 24">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
    </svg>
  );

  const VolumeLowIcon = () => (
    <svg className="volume-icon" viewBox="0 0 24 24">
      <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
    </svg>
  );

  const VolumeHighIcon = () => (
    <svg className="volume-icon" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>
  );

  return (
    <div className={`fullscreen-player ${!showControls ? 'controls-hidden' : ''}`} onMouseMove={handleMouseMove}>
      <video
        ref={videoRef}
        src={src}
        autoPlay
        className="fullscreen-video"
        onClick={togglePlayPause}
      />

      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-info">
            <div className="loading-headline">Buffering… {bufferPct}%</div>
            <div className="loading-meta">{formatSpeed(bufferSpeed)} • {bufferPeers} {bufferPeers === 1 ? 'source' : 'sources'}</div>
            <div className="loading-bar">
              <div className="loading-bar-fill" style={{ width: `${bufferPct}%` }}></div>
            </div>
            {showSwitchPrompt && lowerOption && (
              <button className="switch-btn" onClick={() => {
                switchQuality(lowerOption);
                setShowSwitchPrompt(false);
              }}>Switch to faster {lowerOption.quality?.toUpperCase() || 'SD'}</button>
            )}
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div className={`controls-overlay ${showControls ? 'visible' : 'hidden'}`}>
        {/* Top bar */}
        <div className="top-controls">
          <button className="back-btn" onClick={onClose}>
            ←
          </button>
          <div className="video-info">
            <h2 className="video-title">{title}</h2>
            {subtitle && <p className="video-subtitle">{subtitle}</p>}
          </div>
        </div>

        {/* Center play/pause button */}
        {!isPlaying && !isLoading && (
          <div className="center-controls">
            <button className="center-play-btn" onClick={togglePlayPause}>
              ▶
            </button>
          </div>
        )}

        {/* Bottom controls */}
        <div className="bottom-controls">
          <div className="progress-bar-container">
            <input
              type="range"
              min="0"
              max="100"
              value={progressPercentage}
              onChange={handleSeek}
              className="progress-bar"
            />
            <div className="progress-fill" style={{ width: `${progressPercentage}%` }}></div>
          </div>

          <div className="control-buttons">
            <div className="left-controls">
              <button className="control-btn" onClick={togglePlayPause}>
                {isPlaying ? '⏸' : '▶'}
              </button>
              
              <div className="volume-controls">
                <button className="control-btn" onClick={toggleMute}>
                  {isMuted || volume === 0 ? <VolumeOffIcon /> : volume > 0.5 ? <VolumeHighIcon /> : <VolumeLowIcon />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume * 100}
                  onChange={handleVolumeChange}
                  className="volume-slider"
                />
              </div>

              <div className="time-display">
                <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>
            </div>

            <div className="right-controls">
              <div className="settings-container">
                <button className="control-btn" onClick={() => setSettingsOpen((o) => !o)}>⚙</button>
                {settingsOpen && sortedOptions.length > 0 && (
                  <div className="settings-menu">
                    <h3 className="settings-section-title">Quality</h3>
                    {sortedOptions.map((opt) => {
                      const q = opt.quality?.toUpperCase() || "";
                      let label = q;
                      if (/2160|4K/.test(q)) label = "4K (2160p)";
                      else if (/1080/.test(q)) label = "HD (1080p)";
                      else if (/720/.test(q)) label = "SD (720p)";
                      const seedLeechInfo = `${opt.seeds ?? 0}S/${opt.leeches ?? 0}L`;
                      const isActive = currentOption?.magnet === opt.magnet;
                      return (
                        <button
                          key={opt.magnet}
                          className={`settings-item ${isActive ? "active" : ""}`}
                          onClick={() => {
                            setSettingsOpen(false);
                            switchQuality(opt);
                          }}
                        >
                          <span className="settings-item-label">{label}</span>
                          <span className="settings-item-meta">{seedLeechInfo}</span>
                          <span className="settings-item-check"></span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button className="control-btn" onClick={() => {
                const elem = videoRef.current?.parentElement?.parentElement; // fullscreen container
                if (!elem) return;
                if (!document.fullscreenElement) {
                  elem.requestFullscreen().catch(()=>{});
                } else {
                  document.exitFullscreen().catch(()=>{});
                }
              }}>⛶</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 