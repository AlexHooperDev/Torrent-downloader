import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const TMDB_KEY = process.env.TMDB_KEY;
if (!TMDB_KEY) {
  throw new Error("TMDB_KEY not set in environment");
}

const BASE = "https://api.themoviedb.org/3";

// Helper – keep only English-language entries
function isEnglish(r: any): boolean {
  // TMDB marks original_language using ISO-639-1 ("en" for English)
  return (r.original_language || "en") === "en";
}

export interface MediaItem {
  id: number;
  title: string;
  overview: string;
  poster_path: string;
  release_date?: string;
  media_type: string;
  year?: string;
  vote_average?: number;
  genre_ids?: number[];
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
  runtime?: number | null;
}

async function getTrending(): Promise<MediaItem[]> {
  const url = `${BASE}/trending/all/week`;
  const { data } = await axios.get(url, {
    params: { api_key: TMDB_KEY },
  });

  return data.results.filter(isEnglish).map((r: any) => ({
    id: r.id,
    title: r.title || r.name,
    overview: r.overview,
    poster_path: r.poster_path,
    genre_ids: r.genre_ids,
    release_date: r.release_date || r.first_air_date,
    media_type: r.media_type,
    year: (r.release_date || r.first_air_date || "").split("-")[0],
  }));
}

async function fetchPopular(media: "movie" | "tv", pages = 3): Promise<MediaItem[]> {
  const requests = Array.from({ length: pages }, (_, i) => i + 1).map((page) => {
    const url = `${BASE}/${media}/popular`;
    return axios.get(url, { params: { api_key: TMDB_KEY, page } });
  });

  const responses = await Promise.all(requests);
  const items: MediaItem[] = [];
  for (const { data } of responses) {
    items.push(
      ...data.results.map((r: any) => ({
        id: r.id,
        title: r.title || r.name,
        overview: r.overview,
        poster_path: r.poster_path,
        genre_ids: r.genre_ids,
        release_date: r.release_date || r.first_air_date,
        media_type: media,
        year: (r.release_date || r.first_air_date || "").split("-")[0],
        vote_average: r.vote_average,
      }))
    );
  }
  return items;
}

async function getPopular(): Promise<MediaItem[]> {
  const [movies, tv] = await Promise.all([fetchPopular("movie"), fetchPopular("tv")]);
  // merge arrays and remove potential duplicates by id & media_type key
  const seen = new Set<string>();
  const merged: MediaItem[] = [];
  for (const item of [...movies, ...tv]) {
    const key = `${item.media_type}-${item.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

export async function getTrendingMedia(media: "all" | "movie" | "tv" = "all", pages = 1): Promise<MediaItem[]> {
  const requests = Array.from({ length: pages }, (_, i) => i + 1).map((page) => {
    const url = `${BASE}/trending/${media}/week`;
    return axios.get(url, { params: { api_key: TMDB_KEY, page } });
  });

  const responses = await Promise.all(requests);
  const items: MediaItem[] = [];
  for (const { data } of responses) {
    const filtered = data.results.filter(isEnglish);
    items.push(
      ...filtered.map((r: any) => ({
        id: r.id,
        title: r.title || r.name,
        overview: r.overview,
        poster_path: r.poster_path,
        genre_ids: r.genre_ids,
        release_date: r.release_date || r.first_air_date,
        media_type: media === "all" ? (r.media_type as string) : media,
        year: (r.release_date || r.first_air_date || "").split("-")[0],
        vote_average: r.vote_average,
      }))
    );
  }
  return items;
}

export async function getNewTv(pages = 4): Promise<MediaItem[]> {
  // Set up date filtering - allow shows up to 7 days in the future (for timezone differences)
  const maxFutureDate = new Date();
  maxFutureDate.setDate(maxFutureDate.getDate() + 7);
  const maxFutureDateStr = maxFutureDate.toISOString().split('T')[0];
  
  // Helper function to filter out shows with future release dates
  const filterValidReleaseDate = (r: any) => {
    const releaseDate = r.first_air_date;
    if (!releaseDate) return true; // Keep shows without release dates
    return releaseDate <= maxFutureDateStr; // Only keep shows released within 7 days from now
  };

  // Function to fetch shows from multiple sources
  const fetchShows = async (onAirPages: number, discoverPages: number, daysBack: number) => {
    // Use TMDB on_the_air endpoint for currently airing TV shows (English only)
    const onAirRequests = Array.from({ length: onAirPages }, (_, i) => i + 1).map((page) =>
      axios.get(`${BASE}/tv/on_the_air`, {
        params: { api_key: TMDB_KEY, page, with_original_language: "en" },
      })
    );

    // Get recently aired shows using discover with recent air dates
    const daysAgoDate = new Date();
    daysAgoDate.setDate(daysAgoDate.getDate() - daysBack);
    const recentAirDate = daysAgoDate.toISOString().split('T')[0];

    const discoverRequests = Array.from({ length: discoverPages }, (_, i) => i + 1).map((page) =>
      axios.get(`${BASE}/discover/tv`, {
        params: { 
          api_key: TMDB_KEY, 
          page,
          'first_air_date.gte': recentAirDate,
          sort_by: 'first_air_date.desc',
          with_original_language: 'en'
        }
      })
    );

    const [onAirResponses, discoverResponses] = await Promise.all([
      Promise.all(onAirRequests),
      Promise.all(discoverRequests)
    ]);

    const items: MediaItem[] = [];
    
    // Add on-air shows
    for (const { data } of onAirResponses) {
      items.push(
        ...data.results
          .filter(filterValidReleaseDate)
          .map((r: any) => ({
            id: r.id,
            title: r.name,
            overview: r.overview,
            poster_path: r.poster_path,
            genre_ids: r.genre_ids,
            release_date: r.first_air_date,
            media_type: "tv",
            year: (r.first_air_date || "").split("-")[0],
            vote_average: r.vote_average,
          }))
      );
    }

    // Add recently aired shows
    for (const { data } of discoverResponses) {
      items.push(
        ...data.results
          .filter(filterValidReleaseDate)
          .map((r: any) => ({
            id: r.id,
            title: r.name,
            overview: r.overview,
            poster_path: r.poster_path,
            genre_ids: r.genre_ids,
            release_date: r.first_air_date,
            media_type: "tv",
            year: (r.first_air_date || "").split("-")[0],
            vote_average: r.vote_average,
          }))
      );
    }

    // Remove duplicates by ID
    return items.filter((item, index, self) => 
      index === self.findIndex(t => t.id === item.id)
    );
  };

  // Start with initial fetch
  let shows = await fetchShows(pages, 2, 30); // 4 pages on-air, 2 pages discover, 30 days back

  // If we have fewer than 30 shows, try to get more
  if (shows.length < 30) {
    console.log(`Only ${shows.length} new TV shows found, fetching more...`);
    
    // Try with more pages and longer time range
    shows = await fetchShows(pages + 2, 4, 60); // 6 pages on-air, 4 pages discover, 60 days back
    
    // If still not enough, add popular recent shows as fallback
    if (shows.length < 30) {
      console.log(`Still only ${shows.length} shows, adding popular recent shows...`);
      
      const popularRequests = Array.from({ length: 3 }, (_, i) => i + 1).map((page) =>
        axios.get(`${BASE}/tv/popular`, {
          params: { api_key: TMDB_KEY, page },
        })
      );
      
      const popularResponses = await Promise.all(popularRequests);
      const popularShows: MediaItem[] = [];
      
      for (const { data } of popularResponses) {
        popularShows.push(
          ...data.results
            .filter(filterValidReleaseDate)
            .map((r: any) => ({
              id: r.id,
              title: r.name,
              overview: r.overview,
              poster_path: r.poster_path,
              genre_ids: r.genre_ids,
              release_date: r.first_air_date,
              media_type: "tv",
              year: (r.first_air_date || "").split("-")[0],
              vote_average: r.vote_average,
            }))
        );
      }
      
      // Merge with existing shows and remove duplicates
      const allShows = [...shows, ...popularShows];
      shows = allShows.filter((item, index, self) => 
        index === self.findIndex(t => t.id === item.id)
      );
    }
  }

  return shows;
}

export async function searchMulti(query: string, pages = 1): Promise<MediaItem[]> {
  if (!query) return [];
  const requests = Array.from({ length: pages }, (_, i) => i + 1).map((page) =>
    axios.get(`${BASE}/search/multi`, {
      params: { api_key: TMDB_KEY, query, page, include_adult: false },
    })
  );
  const responses = await Promise.all(requests);
  const results: MediaItem[] = [];
  for (const { data } of responses) {
    results.push(
      ...data.results
        .filter((r: any) => !["person"].includes(r.media_type) && isEnglish(r))
        .map((r: any) => ({
          id: r.id,
          title: r.title || r.name,
          overview: r.overview,
          poster_path: r.poster_path,
          genre_ids: r.genre_ids,
          release_date: r.release_date || r.first_air_date,
          media_type: r.media_type,
          year: (r.release_date || r.first_air_date || "").split("-")[0],
          vote_average: r.vote_average,
        }))
    );
  }
  return results;
}

export interface TvDetails {
  id: number;
  name: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  first_air_date?: string;
  seasons: SeasonInfo[];
  genres: string[];
  cast: string[];
  episode_run_time?: number[];
}

export async function getTvDetails(tvId: number): Promise<TvDetails> {
  const url = `${BASE}/tv/${tvId}`;
  const { data } = await axios.get(url, {
    params: { api_key: TMDB_KEY, append_to_response: "credits" },
  });

  return {
    id: data.id,
    name: data.name,
    overview: data.overview,
    poster_path: data.poster_path,
    backdrop_path: data.backdrop_path,
    first_air_date: data.first_air_date,
    seasons: data.seasons.map((s: any) => ({
      season_number: s.season_number,
      episode_count: s.episode_count,
      air_date: s.air_date,
      poster_path: s.poster_path,
    })),
    genres: (data.genres || []).map((g: any) => g.name),
    cast: (data.credits?.cast || []).slice(0, 5).map((c: any) => c.name),
    episode_run_time: data.episode_run_time,
  };
}

export async function getSeasonEpisodes(tvId: number, season: number): Promise<EpisodeInfo[]> {
  const url = `${BASE}/tv/${tvId}/season/${season}`;
  const { data } = await axios.get(url, { params: { api_key: TMDB_KEY } });

  return data.episodes.map((e: any) => ({
    id: e.id,
    name: e.name,
    overview: e.overview,
    season_number: e.season_number,
    episode_number: e.episode_number,
    still_path: e.still_path,
    air_date: e.air_date,
    runtime: e.runtime || null,
  }));
}

export interface MovieDetails {
  id: number;
  title: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  runtime?: number | null;
  genres: string[];
  cast: string[];
}

export async function getMovieDetails(movieId: number): Promise<MovieDetails> {
  const url = `${BASE}/movie/${movieId}`;
  const { data } = await axios.get(url, {
    params: { api_key: TMDB_KEY, append_to_response: "credits" },
  });

  return {
    id: data.id,
    title: data.title,
    overview: data.overview,
    poster_path: data.poster_path,
    backdrop_path: data.backdrop_path,
    release_date: data.release_date,
    runtime: data.runtime,
    genres: (data.genres || []).map((g: any) => g.name),
    cast: (data.credits?.cast || []).slice(0, 5).map((c: any) => c.name),
  };
}

export interface Genre {
  id: number;
  name: string;
}

export async function getGenres(media: "movie" | "tv"): Promise<Genre[]> {
  const url = `${BASE}/genre/${media}/list`;
  const { data } = await axios.get(url, {
    params: { api_key: TMDB_KEY },
  });
  return data.genres as Genre[];
}

interface DiscoverOptions {
  page?: number;
  pages?: number; // number of pages to gather starting from page
  genreId?: number;
  sortBy?: "popularity.desc" | "vote_average.desc";
  minVotes?: number;
  fromDate?: string; // ISO yyyy-mm-dd
}

export async function discoverMedia(
  media: "movie" | "tv",
  { page = 1, pages = 1, genreId, sortBy = "popularity.desc", minVotes = 100, fromDate }: DiscoverOptions = {}
): Promise<MediaItem[]> {
  const fetchPage = async (pg: number) => {
    const url = `${BASE}/discover/${media}`;
    const params: any = {
      api_key: TMDB_KEY,
      page: pg,
      sort_by: sortBy,
      with_original_language: "en",
      "vote_count.gte": minVotes,
    };
    if (genreId) params.with_genres = genreId;
    if (fromDate) {
      if (media === "movie") {
        params["primary_release_date.gte"] = fromDate;
      } else {
        params["first_air_date.gte"] = fromDate;
      }
    }
    const { data } = await axios.get(url, { params });
    return data.results.filter(isEnglish) as any[];
  };

  const items: MediaItem[] = [];
  const start = page;
  for (let i = 0; i < pages; i++) {
     const pageItems = await fetchPage(start + i);
     items.push(...pageItems);
   }

   // Deduplicate by media_type & id while preserving order
   const seen = new Set<string>();
   const unique: any[] = [];
   for (const it of items) {
     const key = `${media}-${it.id}`;
     if (!seen.has(key)) {
       seen.add(key);
       unique.push(it);
     }
   }

   // Map to MediaItem shape
   return unique.map((r: any) => ({
     id: r.id,
     title: r.title || r.name,
     overview: r.overview,
     poster_path: r.poster_path,
     genre_ids: r.genre_ids,
     release_date: media === "movie" ? r.release_date : r.first_air_date,
     media_type: media,
     year: (r.release_date || r.first_air_date || "").split("-")[0],
     vote_average: r.vote_average,
   }));
}

export interface VideoItem {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
}

export async function getTvVideos(tvId: number): Promise<VideoItem[]> {
  const url = `${BASE}/tv/${tvId}/videos`;
  const { data } = await axios.get(url, {
    params: { api_key: TMDB_KEY, language: "en-US" },
  });
  return data.results as VideoItem[];
}

export async function getMovieVideos(movieId: number): Promise<VideoItem[]> {
  const url = `${BASE}/movie/${movieId}/videos`;
  const { data } = await axios.get(url, {
    params: { api_key: TMDB_KEY, language: "en-US" },
  });
  return data.results as VideoItem[];
}

export default {
  getPopular,
  getTrending,
  getTrendingMedia,
  getNewTv,
  searchMulti,
  getTvDetails,
  getMovieDetails,
  getSeasonEpisodes,
  getGenres,
  discoverMedia,
  getTvVideos,
  getMovieVideos,
}; 