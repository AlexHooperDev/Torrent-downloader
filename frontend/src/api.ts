export interface TorrentInfo {
  magnet?: string;
  seeds?: number;
  size?: number;
}

export interface CatalogItem {
  id: number;
  title: string;
  poster_path: string;
  overview: string;
  torrent?: TorrentInfo;
  media_type: string;
  vote_average?: number;
  year?: string;
}

export interface TorrentOption extends TorrentInfo {
  leeches?: number;
  quality?: string;
  ratio?: number;
}

export interface SeasonInfo {
  season_number: number;
  episode_count: number;
  air_date?: string;
  poster_path?: string;
}

export interface EpisodeInfo {
  id: number;
  name: string;
  overview: string;
  season_number: number;
  episode_number: number;
  still_path?: string;
  air_date?: string;
  runtime?: number;
}

export interface TorrentProgress {
  progress: number;
  fileProgress?: number;
  speed: number;
  peers: number;
  eta?: number;
}

// Get API base URL - use relative paths in production, localhost in development
const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';

export async function getCatalog(): Promise<CatalogItem[]> {
  const res = await fetch(`${API_BASE}/catalog`);
  if (!res.ok) throw new Error("Failed to fetch catalog");
  return res.json();
}

export async function getTorrentOptions(title: string, year?: string): Promise<TorrentOption[]> {
  const params = new URLSearchParams({ title, year: year || "" });
  const res = await fetch(`${API_BASE}/torrents?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch torrents");
  return res.json();
}

export async function getEpisodeTorrentOptions(title: string, season: number, episode: number, year?: string): Promise<TorrentOption[]> {
  const params = new URLSearchParams({ title, year: year || "", season: season.toString(), episode: episode.toString() });
  const res = await fetch(`${API_BASE}/torrents?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch torrents");
  return res.json();
}

export async function getTrending(media: "movie" | "tv" | "all" = "all", pages = 3): Promise<CatalogItem[]> {
  const params = new URLSearchParams({ media, pages: pages.toString() });
  const res = await fetch(`${API_BASE}/trending?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch trending");
  return res.json();
}

export async function getNewTv(): Promise<CatalogItem[]> {
  const res = await fetch(`${API_BASE}/tv/new`);
  if (!res.ok) throw new Error("Failed to fetch new tv");
  return res.json();
}

export interface ShowDetailsApi {
  id: number;
  name: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  seasons: SeasonInfo[];
  genres?: string[];
  cast?: string[];
  episode_run_time?: number[];
}

export async function getShowDetails(tvId: number): Promise<ShowDetailsApi> {
  const res = await fetch(`${API_BASE}/tv/${tvId}/details`);
  if (!res.ok) throw new Error("Failed to fetch show details");
  return res.json();
}

export async function getSeasonEpisodes(tvId: number, season: number): Promise<EpisodeInfo[]> {
  const res = await fetch(`${API_BASE}/tv/${tvId}/season/${season}`);
  if (!res.ok) throw new Error("Failed to fetch season episodes");
  return res.json();
}

export async function searchCatalog(query: string): Promise<CatalogItem[]> {
  if (!query) return [];
  const params = new URLSearchParams({ q: query });
  const res = await fetch(`${API_BASE}/search?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to search");
  return res.json();
}

export interface GenreItem {
  id: number;
  name: string;
}

export async function getGenres(media: "movie" | "tv" = "movie"): Promise<GenreItem[]> {
  const params = new URLSearchParams({ media });
  const res = await fetch(`${API_BASE}/genres?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch genres");
  return res.json();
}

export async function discoverCatalog({
  media,
  genreId,
  sort,
  page = 1,
  pages = 3,
  fromDate,
}: {
  media: "movie" | "tv";
  genreId?: number;
  sort: "popularity" | "rating";
  page?: number;
  pages?: number;
  fromDate?: string;
}): Promise<CatalogItem[]> {
  const params = new URLSearchParams({ media, sort, page: page.toString(), pages: pages.toString() });
  if (genreId) params.set("genreId", genreId.toString());
  if (fromDate) params.set("from", fromDate);
  const res = await fetch(`${API_BASE}/discover?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to discover");
  return res.json();
}

export async function purgeTorrents(): Promise<void> {
  await fetch(`${API_BASE}/torrents/purge`, { method: "POST" });
}

export async function getTorrentProgress(magnet: string): Promise<TorrentProgress | null> {
  if (!magnet) return null;
  const params = new URLSearchParams({ magnet });
  const res = await fetch(`${API_BASE}/torrent/progress?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch progress");
  return res.json();
}

export interface MovieDetailsApi {
  id: number;
  title: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  runtime?: number | null;
  genres?: string[];
  cast?: string[];
}

export async function getMovieDetails(movieId: number): Promise<MovieDetailsApi> {
  const res = await fetch(`${API_BASE}/movie/${movieId}/details`);
  if (!res.ok) throw new Error("Failed to fetch movie details");
  return res.json();
}

export interface VideoItem {
  id: string;
  key: string;
  name: string;
  site: string; // e.g., "YouTube"
  type: string; // e.g., "Trailer"
}

export async function getMovieVideos(movieId: number): Promise<VideoItem[]> {
  const res = await fetch(`${API_BASE}/movie/${movieId}/videos`);
  if (!res.ok) return [];
  return res.json();
}

export async function getShowVideos(tvId: number): Promise<VideoItem[]> {
  const res = await fetch(`${API_BASE}/tv/${tvId}/videos`);
  if (!res.ok) return [];
  return res.json();
} 