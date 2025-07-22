import "./bootstrap";
import express, { Request, Response } from "express";
import dotenv from "dotenv";
import NodeCache from "node-cache";
import tmdbClient, { MediaItem, getTvVideos, getMovieVideos, VideoItem } from "./tmdb";
import { getGenres, discoverMedia } from "./tmdb";
import { searchTopTorrent, searchTorrentOptions } from "./torrent";
import cors from "cors";
import { streamTorrent, purgeAllTorrents, getClient } from "./stream";
import { errorHandler } from "./middleware/errorHandler";

dotenv.config();

const PORT = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 60 * 60 }); // 1-hour cache

const app = express();
app.use(cors());

app.get("/catalog", async (_req: Request, res: Response) => {
  try {
    const cached = cache.get("catalog");
    if (cached) {
      return res.json(cached);
    }

    const items = await tmdbClient.getPopular();
    // limit concurrent torrent lookups to avoid proxy overload
    const concurrency = 20;
    const enriched: MediaItem[] = [] as any;
    for (let i = 0; i < items.length; i += concurrency) {
      const slice = items.slice(i, i + concurrency);
      const results = await Promise.all(
        slice.map(async (item: MediaItem) => {
          const torrent = await searchTopTorrent(item);
          return { ...item, torrent } as any;
        })
      );
      enriched.push(...results);
    }

    cache.set("catalog", enriched);
    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/torrents", async (req: Request, res: Response) => {
  const title = req.query.title as string;
  const year = req.query.year as string | undefined;
  const seasonParam = req.query.season as string | undefined;
  const episodeParam = req.query.episode as string | undefined;

  const season = seasonParam ? parseInt(seasonParam, 10) : undefined;
  const episode = episodeParam ? parseInt(episodeParam, 10) : undefined;

  if (!title) {
    return res.status(400).json({ error: "title query param required" });
  }
  try {
    const options = await searchTorrentOptions(title, year, 20, season, episode);
    res.json(options);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch torrents" });
  }
});

app.post("/torrents/purge", (_req: Request, res: Response) => {
  try {
    purgeAllTorrents();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to purge" });
  }
});

app.get("/trending", async (req: Request, res: Response) => {
  const media = (req.query.media as "all" | "movie" | "tv" | undefined) || "all";
  const pagesParam = req.query.pages ? parseInt(req.query.pages as string, 10) : 3;
  const cacheKey = `trending-${media}-p${pagesParam}`;
  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const items = await tmdbClient.getTrendingMedia(media as any, pagesParam);
    cache.set(cacheKey, items);
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch trending" });
  }
});

app.get("/tv/new", async (_req: Request, res: Response) => {
  const cacheKey = "tv-new";
  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const items = await tmdbClient.getNewTv();
    cache.set(cacheKey, items);
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch new tv" });
  }
});

app.get("/search", async (req: Request, res: Response) => {
  const query = (req.query.q as string) || "";
  if (!query) return res.status(400).json({ error: "q query param required" });

  try {
    const results = await tmdbClient.searchMulti(query);
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to search" });
  }
});

app.get("/tv/:id/details", async (req: Request, res: Response) => {
  const tvId = parseInt(req.params.id, 10);
  if (isNaN(tvId)) return res.status(400).json({ error: "Invalid id" });
  const cacheKey = `tv-details-${tvId}`;
  try {
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);
    const details = await tmdbClient.getTvDetails(tvId);
    cache.set(cacheKey, details);
    res.json(details);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tv details" });
  }
});

app.get("/tv/:id/season/:num", async (req: Request, res: Response) => {
  const tvId = parseInt(req.params.id, 10);
  const seasonNum = parseInt(req.params.num, 10);
  if (isNaN(tvId) || isNaN(seasonNum)) return res.status(400).json({ error: "Invalid id or season" });
  const cacheKey = `tv-${tvId}-season-${seasonNum}`;
  try {
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);
    const episodes = await tmdbClient.getSeasonEpisodes(tvId, seasonNum);
    cache.set(cacheKey, episodes);
    res.json(episodes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch season" });
  }
});

app.get("/movie/:id/details", async (req: Request, res: Response) => {
  const movieId = parseInt(req.params.id, 10);
  if (isNaN(movieId)) return res.status(400).json({ error: "Invalid id" });
  const cacheKey = `movie-details-${movieId}`;
  try {
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);
    const details = await tmdbClient.getMovieDetails(movieId as any);
    cache.set(cacheKey, details);
    res.json(details);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch movie details" });
  }
});

app.get("/tv/:id/videos", async (req: Request, res: Response) => {
  const tvId = parseInt(req.params.id, 10);
  if (isNaN(tvId)) return res.status(400).json({ error: "Invalid id" });
  const cacheKey = `tv-videos-${tvId}`;
  try {
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);
    const list: VideoItem[] = await getTvVideos(tvId);
    cache.set(cacheKey, list, 60 * 60); // 1h
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

app.get("/movie/:id/videos", async (req: Request, res: Response) => {
  const movieId = parseInt(req.params.id, 10);
  if (isNaN(movieId)) return res.status(400).json({ error: "Invalid id" });
  const cacheKey = `movie-videos-${movieId}`;
  try {
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);
    const list: VideoItem[] = await getMovieVideos(movieId);
    cache.set(cacheKey, list, 60 * 60);
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

app.get("/torrent/progress", (req: Request, res: Response) => {
  const magnet = req.query.magnet as string;
  if (!magnet) {
    return res.status(400).json({ error: "magnet query param required" });
  }

  const torrent = getClient().get(magnet);
  if (!torrent) {
    return res.status(404).json({ error: "Torrent not found" });
  }

  const file = torrent.files && torrent.files[0];
  res.json({
    progress: torrent.progress, // all pieces
    fileProgress: file ? file.progress : undefined, // selected video file
    speed: torrent.downloadSpeed,
    peers: torrent.numPeers,
    eta: torrent.timeRemaining,
  });
});

app.get("/stream", streamTorrent);

app.get("/genres", async (req: Request, res: Response) => {
  const media = (req.query.media as "movie" | "tv") || "movie";
  const cacheKey = `genres-${media}`;
  try {
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);
    const list = await getGenres(media);
    cache.set(cacheKey, list, 24 * 60 * 60); // cache 24h
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch genres" });
  }
});

app.get("/discover", async (req: Request, res: Response) => {
  const media = (req.query.media as "movie" | "tv") || "movie";
  const genreId = req.query.genreId ? parseInt(req.query.genreId as string, 10) : undefined;
  const sort = (req.query.sort as string) || "popularity"; // rating or popularity
  const sortBy = sort === "rating" ? "vote_average.desc" : "popularity.desc";
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const pagesParam = req.query.pages ? parseInt(req.query.pages as string, 10) : 3;
  const from = req.query.from as string | undefined; // expect yyyy-mm-dd
  const cacheKey = `discover-${media}-${genreId || "all"}-${sort}-${page}-p${pagesParam}-${from || "na"}`;
  try {
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);
    const results = await discoverMedia(media, { genreId, sortBy, page, pages: pagesParam, fromDate: from });
    console.log("/discover", { media, genreId, sort, from, page, pages: pagesParam, returned: results.length });
    cache.set(cacheKey, results, 60 * 30); // 30min cache
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch discover" });
  }
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

export default app; 