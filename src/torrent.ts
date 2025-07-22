import axios from "axios";
import TorrentSearchApi from "torrent-search-api";
import { MediaItem } from "./tmdb";

const TPB_BASE = process.env.TPB_PROXY || "https://apibay.org";
const TORRENT_DEBUG = process.env.TORRENT_DEBUG === "1";
// Global HTTP timeout for external API calls (1 minute)
const HTTP_TIMEOUT = 60_000;

// Initialise torrent-search-api once
// We purposefully enable only general-content providers and exclude anime/kids-centric indexers.
try {
  // Disable the default provider set and enable the ones we want explicitly
  TorrentSearchApi.disableAllProviders && TorrentSearchApi.disableAllProviders();
  // These cover a broad public catalogue of movies & TV
  const providers = ["1337x", "ThePirateBay", "TorrentGalaxy", "EZTV"];
  for (const p of providers) {
    try {
      TorrentSearchApi.enableProvider(p);
    } catch (_err) {
      // Provider may fail to enable if captchas/change of site – ignore
    }
  }
} catch (_err) {
  // Library may throw in environments without proper configuration; swallow
}

export interface TorrentInfo {
  name?: string;
  magnet?: string;
  seeds?: number;
  size?: number;
  leeches?: number;
  quality?: string;
  ratio?: number;
}

export async function searchTopTorrent(item: MediaItem): Promise<TorrentInfo | null> {
  try {
    const query = encodeURIComponent(`${item.title} ${item.year || ""} 1080p`);
    const url = `${TPB_BASE}/q.php?q=${query}&cat=200,201`;
    const { data } = await axios.get(url, { timeout: HTTP_TIMEOUT });

    if (!Array.isArray(data) || data.length === 0) return null;

    data.sort((a: any, b: any) => parseInt(b.seeders) - parseInt(a.seeders));
    const top = data[0];

    return {
      name: top.name,
      magnet: `magnet:?xt=urn:btih:${top.info_hash}&dn=${encodeURIComponent(top.name)}&tr=udp://tracker.openbittorrent.com:6969/announce`,
      seeds: parseInt(top.seeders),
      size: parseInt(top.size),
    };
  } catch (e) {
    console.error("Torrent search error", e);
    return null;
  }
}

export async function searchTorrentOptions(title: string, year?: string, limit = 20, season?: number, episode?: number): Promise<TorrentInfo[]> {
  try {
    const queries: string[] = [];

    const base = title.trim();
    const s = season !== undefined ? season.toString().padStart(2, "0") : undefined;
    const e = episode !== undefined ? episode.toString().padStart(2, "0") : undefined;

    // Build candidate queries (higher-precision first)
    if (season !== undefined && episode !== undefined) {
      queries.push(`${base} S${s}E${e}`);
      queries.push(`${base} ${season}x${episode}`);
      queries.push(`${base} Season ${season} Episode ${episode}`);
    }

    // Fallbacks with year or generic title
    if (year) {
      queries.push(`${base} ${year}`);
    }
    queries.push(base);

    const allResults: TorrentInfo[] = [];

    // For each query search providers in parallel until we accumulate at least `limit` results
    for (const q of queries) {
      const [pbResults, tsaResults] = await Promise.all([
        performSearch(q, limit * 2, season !== undefined), // grab a bit more for deduping
        searchViaTorrentSearchApi(q, limit * 2, season !== undefined ? "TV" : "Movies"),
      ]);

      allResults.push(...pbResults, ...tsaResults);

      if (!season && episode === undefined) {
        // Movie – attempt YTS once (only need to do this for the base title)
        const ytsResults = await searchYTS(base, year, limit * 2);
        allResults.push(...ytsResults);
      }

      if (allResults.length >= limit * 3) {
        // We have plenty, break early to save bandwidth
        break;
      }
    }

    const deduped = dedupTorrents(allResults);

    // --------------------------------------------------
    // Final filtering to pick top option per quality tier
    // --------------------------------------------------
    const qualityRe = /(2160p|4K|1080p|720p|480p|HDRIP|BLURAY|WEBRIP|CAM)/i;
    const isEp = season !== undefined && episode !== undefined;
    const minSeeds = isEp ? 5 : 20;

    // Helper: detect SxxEyy or similar patterns – used to guard movie searches from episode torrents (non-global so each .test() is fresh)
    const episodeTokenRe = /(?:S\d{1,2}[\s._-]*E\d{1,2}|\d{1,2}[xX]\d{1,2}|Season[\s._-]*\d{1,2}[\s._-]*Episode)/i;

    // Helper: capture a 4-digit year token (1900-2099) that stands alone (avoid 1080p etc.)
    const yearTokenRe = /\b(19|20)\d{2}\b/;

    // Ensure ratio present & quality detected
    const enrichedRaw = deduped.map((t) => {
      const qMatch = t.name?.match(qualityRe);
      const quality = qMatch ? qMatch[1].toUpperCase().replace("4K", "2160P") : t.quality || "UNKNOWN";
      const seeds = t.seeds || 0;
      const leeches = t.leeches || 0;
      const ratio = t.ratio ?? (leeches === 0 ? seeds : seeds / leeches);
      return { ...t, quality, ratio, seeds, leeches } as TorrentInfo;
    });

    const enriched: TorrentInfo[] = [];
    for (const t of enrichedRaw) {
      let rejectedReason: string | null = null;
      if (t.quality === "CAM") rejectedReason = "CAM";
      else if ((t.seeds ?? 0) < minSeeds) rejectedReason = `Low seeds (${t.seeds})`;
      else if (isNonEnglish(t.name)) rejectedReason = "Non-English language tag";
      else if (isEp && (t.size ?? 0) > 20 * 1024 * 1024 * 1024) rejectedReason = "Likely full season (size >20GB)";
      else if (isEp && season !== undefined && episode !== undefined && !matchesEpisode(t.name, season, episode)) rejectedReason = "Episode token mismatch";
      // Extra guards for MOVIE searches only
      else if (!isEp) {
        // 1) Reject torrents that clearly look like individual TV episodes
        if (episodeTokenRe.test(t.name || "")) {
          rejectedReason = "Appears to be TV episode for movie search";
        }

        // 2) If a distinct year token exists and we had a requested year, reject if it differs by >1
        else if (year && yearTokenRe.test(t.name || "")) {
          const yMatch = (t.name || "").match(yearTokenRe);
          if (yMatch) {
            const foundYear = parseInt(yMatch[0], 10);
            const expectedYear = parseInt(year, 10);
            if (Math.abs(foundYear - expectedYear) > 1) {
              rejectedReason = `Year mismatch (${foundYear} vs ${expectedYear})`;
            }
          }
        }
      }

      if (TORRENT_DEBUG) {
        const baseInfo = {
          name: t.name,
          seeds: t.seeds,
          leeches: t.leeches,
          quality: t.quality,
          sizeMB: t.size ? (t.size / (1024 * 1024)).toFixed(1) : undefined,
        };
        if (rejectedReason) {
          console.log(`[filter] REJECT`, { ...baseInfo, reason: rejectedReason });
        } else {
          console.log(`[filter] KEEP`, baseInfo);
        }
      }

      if (rejectedReason) continue;
      enriched.push(t);
    }

    if (enriched.length === 0) return [];

    // Sort by ratio desc then seeds desc
    enriched.sort((a, b) => {
      const rd = (b.ratio || 0) - (a.ratio || 0);
      if (rd !== 0) return rd;
      return (b.seeds || 0) - (a.seeds || 0);
    });

    const seenQualities = new Set<string>();
    const selected: TorrentInfo[] = [];
    for (const t of enriched) {
      if (!seenQualities.has(t.quality || "UNKNOWN")) {
        seenQualities.add(t.quality || "UNKNOWN");
        selected.push(t);
      }
      if (selected.length >= limit) break;
    }

    // If for some reason nothing selected, fallback to top few seeds
    if (selected.length === 0) {
      return enriched.slice(0, Math.min(limit, enriched.length));
    }

    return selected;
  } catch (e) {
    console.error("Torrent options search error", e);
    return [];
  }
}

async function performSearch(searchTitle: string, limit: number, isEpisode: boolean): Promise<TorrentInfo[]> {
  const query = encodeURIComponent(searchTitle);
  const url = `${TPB_BASE}/q.php?q=${query}&cat=200,201`;
  const { data } = await axios.get(url, { timeout: HTTP_TIMEOUT });

  if (!Array.isArray(data)) return [];

  // Compute ratio and filter low-seed torrents
  const enriched = data
    .map((t: any) => {
      const seeds = parseInt(t.seeders);
      const leeches = parseInt(t.leechers);
      const ratio = leeches === 0 ? seeds : seeds / leeches;
      return { ...t, seeds, leeches, ratio };
    })
    .filter((t: any) => t.seeds >= (isEpisode ? 5 : 20)); // allow lower seed count for episodes

  if (enriched.length === 0) return [];

  // Sort by ratio desc, then seeds desc
  enriched.sort((a: any, b: any) => {
    const ratioDiff = b.ratio - a.ratio;
    if (ratioDiff !== 0) return ratioDiff;
    return b.seeds - a.seeds;
  });

  const qualityRe = /(2160p|4K|1080p|720p|480p|CAM|HDRip|BluRay|WEBRip)/i;

  const seenQualities = new Set<string>();
  const selected: any[] = [];
  for (const t of enriched) {
    const qualityMatch = t.name.match(qualityRe);
    const quality = qualityMatch ? qualityMatch[1].toUpperCase() : "UNKNOWN";
    if (quality === "UNKNOWN" && selected.length > 0) continue;
    if (!seenQualities.has(quality)) {
      seenQualities.add(quality);
      selected.push({ ...t, quality });
    }
    if (selected.length >= limit) break;
  }

  if (selected.length === 0 && enriched.length > 0) {
    selected.push({ ...enriched[0], quality: "UNKNOWN" });
  }

  return selected.map((t: any) => {
    const qualityMatch = t.name.match(qualityRe);
    const quality = qualityMatch ? qualityMatch[1].toUpperCase() : t.quality || "UNKNOWN";
    return {
      name: t.name,
      magnet: `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(t.name)}&tr=udp://tracker.openbittorrent.com:6969/announce`,
      seeds: t.seeds,
      leeches: t.leeches,
      size: parseInt(t.size),
      quality,
      ratio: t.ratio,
    };
  });
}

// -----------------------------------------------------
// Additional providers
// -----------------------------------------------------

async function searchYTS(title: string, year?: string, limit = 20): Promise<TorrentInfo[]> {
  try {
    const params = new URLSearchParams();
    params.set("query_term", title);
    params.set("limit", String(limit));
    if (year) params.set("year", year);

    const url = `https://yts.mx/api/v2/list_movies.json?${params.toString()}`;
    const { data } = await axios.get(url, { timeout: HTTP_TIMEOUT });

    if (!data || data.status !== "ok" || !data.data || !Array.isArray(data.data.movies)) return [];

    const torrents: TorrentInfo[] = [];
    for (const movie of data.data.movies) {
      for (const t of movie.torrents || []) {
        const magnet = `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(movie.title_long)}&tr=udp://tracker.openbittorrent.com:6969/announce`;
        torrents.push({
          name: `${movie.title_long} [YTS]`,
          magnet,
          seeds: t.seeds,
          size: parseInt(t.size_bytes, 10),
          leeches: t.peers,
          quality: t.quality.toUpperCase(),
          ratio: t.peers === 0 ? t.seeds : t.seeds / t.peers,
        });
      }
    }
    return torrents;
  } catch (_err) {
    return [];
  }
}

async function searchViaTorrentSearchApi(query: string, limit = 20, category: "All" | "Movies" | "TV" = "All"): Promise<TorrentInfo[]> {
  try {
    const results = (await TorrentSearchApi.search(query, category, limit)) || [];
    return results.map((r: any) => ({
      name: r.title,
      magnet: r.magnet || r.magnetLink || r.link,
      seeds: r.seeds,
      leeches: r.peers,
      size: typeof r.size === "string" ? undefined : r.size,
      quality: undefined,
      ratio: r.peers === 0 ? r.seeds : r.seeds / r.peers,
    })).filter((t: TorrentInfo) => !!t.magnet);
  } catch (_err) {
    return [];
  }
}

function dedupTorrents(torrents: TorrentInfo[]): TorrentInfo[] {
  const map = new Map<string, TorrentInfo>();
  for (const t of torrents) {
    if (!t.magnet) continue;
    const hashMatch = t.magnet.match(/btih:([a-fA-F0-9]{32,40})/i);
    const key = hashMatch ? hashMatch[1].toUpperCase() : t.magnet;
    const existing = map.get(key);
    if (!existing || (t.seeds || 0) > (existing.seeds || 0)) {
      map.set(key, t);
    }
  }
  return Array.from(map.values());
}

// Check if torrent name explicitly matches the requested season & episode
function matchesEpisode(name: string | undefined, season: number, episode: number): boolean {
  if (!name) return false;

  const seasonNum = season.toString(); // e.g. "1"
  const seasonNumPadded = season.toString().padStart(2, "0"); // "01"
  const episodeNum = episode.toString(); // "2"
  const episodeNumPadded = episode.toString().padStart(2, "0"); // "02"

  // Helper to build negative look-ahead that stops matches when the next
  // character continues a multi-episode range (e.g. "E02-03") or another digit.
  const end = "(?![\\d-])"; // neither another number nor a hyphen directly after

  const patterns = [
    // S01E02 / S1E2 including dots / spaces / underscores between tokens
    new RegExp(`S0?${seasonNum}[\\s._-]*E0?${episodeNum}${end}`, "i"),

    // 1x02 or 1 x 2 (any whitespace / dot / underscore separator)
    new RegExp(`${seasonNum}[\\s._-]*[xX][\\s._-]*0?${episodeNum}${end}`, "i"),

    // Season 1 Episode 2  (allow "Season 01" etc.)
    new RegExp(`Season[\\s._-]+0?${seasonNum}[\\s._-]+Episode[\\s._-]+0?${episodeNum}\\b`, "i"),

    // Compact numeric: 102 → S01E02  (needs delim before & after to avoid 1080)
    new RegExp(`(?:[^\\d]|^)${seasonNumPadded}${episodeNumPadded}(?:[^\\d]|$)`, "i"),
  ];

  return patterns.some((p) => p.test(name));
}

// Detects explicit non-English language tags in torrent names
function isNonEnglish(name: string | undefined): boolean {
  if (!name) return false;
  const nonEngRe = /(\b(?:FRENCH|FRENCHSUB|SUBFRENCH|VOSTFR|MULTI|SPANISH|LATINO|CASTELLANO|ESPANOL|PORTUGUESE|PORTUGUES|BRRip\s?PORT|HINDI|HUN|DUTCH|GERMAN|DEUTSCH|ITALIAN|ITA|KOREAN|JAPANESE|RUSSIAN|TURKISH|NORWEGIAN|SWEDISH|NORDIC|FINNISH|POLISH|DANISH)\b)/i;
  return nonEngRe.test(name);
} 