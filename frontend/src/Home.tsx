import { useEffect, useState, useRef } from "react";
import {
  getTrending,
  getNewTv,
  CatalogItem,
} from "./api";

const KID_GENRE_IDS = [16, 10751, 10762];
function filterKids(items: CatalogItem[]): CatalogItem[] {
  return items.filter((it: any) => {
    const ids: number[] | undefined = it.genre_ids;
    if (ids && ids.some((id) => KID_GENRE_IDS.includes(id))) return false;
    const names: string[] | undefined = it.genres;
    if (names && names.some((n) => ["Animation", "Family", "Kids"].includes(n))) return false;
    return true;
  });
}

// Filter out Talk, Reality, News, and Soap categories
const UNWANTED_TV_GENRE_IDS = [10767, 10764, 10763, 10766]; // Talk, Reality, News, Soap
function filterUnwantedTvCategories(items: CatalogItem[]): CatalogItem[] {
  return items.filter((it: any) => {
    const ids: number[] | undefined = it.genre_ids;
    if (ids && ids.some((id) => UNWANTED_TV_GENRE_IDS.includes(id))) return false;
    const names: string[] | undefined = it.genres;
    if (names && names.some((n) => ["Talk", "Reality", "News", "Soap"].includes(n))) return false;
    return true;
  });
}

function filterAnimeAndJapanese(items: CatalogItem[]): CatalogItem[] {
  return items.filter((it: any) => {
    const title = it.title?.toLowerCase() || "";
    const overview = it.overview?.toLowerCase() || "";
    
    // Filter out obvious anime/manga keywords
    const animeKeywords = [
      "anime", "manga", "japanese animation", "studio ghibli",
      "one piece", "naruto", "dragon ball", "attack on titan",
      "demon slayer", "jujutsu kaisen", "my hero academia",
      "pokemon", "digimon", "sailor moon", "bleach",
      "hunter x hunter", "fullmetal alchemist", "death note",
      "spirited away", "totoro", "princess mononoke",
      "akira", "ghost in the shell", "cowboy bebop",
      "your name", "weathering with you", "grave of the fireflies"
    ];
    
    const hasAnimeKeywords = animeKeywords.some(keyword => 
      title.includes(keyword) || overview.includes(keyword)
    );
    
    if (hasAnimeKeywords) return false;
    
    // Check for Japanese origin indicators
    const japaneseIndicators = [
      "japanese", "japan", "tokyo", "osaka", "kyoto",
      "samurai", "ninja", "yakuza", "shonen", "shounen",
      "seinen", "josei", "shoujo", "mecha", "kawaii"
    ];
    
    const hasJapaneseIndicators = japaneseIndicators.some(indicator => 
      title.includes(indicator) || overview.includes(indicator)
    );
    
    if (hasJapaneseIndicators) return false;
    
    return true;
  });
}
import "./App.css";
import Modal from "./Modal";
import ShowModal from "./ShowModal";
import HorizontalCarousel from "./HorizontalCarousel";
import { getAllProgress } from "./progress";
import PosterHoverCard from "./PosterHoverCard";

interface GridItem extends CatalogItem {
  resumeLabel?: string;
}

interface HomeProps {
  searchResults: CatalogItem[];
  searching: boolean;
}

function GridSection({ title, items, onSelect }: { title: string; items: GridItem[]; onSelect: (it: GridItem) => void }) {
  const [hoveredItem, setHoveredItem] = useState<GridItem | null>(null);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);
  const [fadeOut, setFadeOut] = useState(false);
  const componentId = useRef(Math.random().toString(36).substring(2, 10));

  useEffect(() => {
    function handleExternalOpen(event: Event) {
      const detailId = (event as CustomEvent<string>).detail;
      if (detailId !== componentId.current) {
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
          setHoverTimeout(null);
        }
        setHoveredItem(null);
        setFadeOut(false);
      }
    }
    window.addEventListener('hovercard-open', handleExternalOpen);
    return () => window.removeEventListener('hovercard-open', handleExternalOpen);
  }, [hoverTimeout]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }
    };
  }, [hoverTimeout]);

  if (items.length === 0) return null;

  const handleMouseEnter = (item: GridItem) => {
    window.dispatchEvent(new CustomEvent('hovercard-open', { detail: componentId.current }));
    // If a card is already displayed, switch instantly to the new one
    if (hoveredItem) {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        setHoverTimeout(null);
      }
      setHoveredItem(item);
      return;
    }

    // Otherwise use a short delay to avoid flicker when grazing across posters
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
    }

    const timeout = setTimeout(() => {
      setHoveredItem(item);
    }, 500);

    setHoverTimeout(timeout);
  };

  const handleMouseLeave = () => {
    // Clear the timeout if mouse leaves before delay completes
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    
    // Hide the hover card immediately
    setHoveredItem(null);
  };

  return (
    <section className="section">
      <h2>{title}</h2>
      <div className="grid">
        {items.map((it) => (
          <div 
            key={`${title}-${it.id}`} 
            className="card" 
            onMouseEnter={() => handleMouseEnter(it)}
            onMouseLeave={handleMouseLeave}
            onClick={() => onSelect(it)}
          >
            <img
              src={`https://image.tmdb.org/t/p/w342${it.poster_path}`}
              alt={it.title}
            />
            
            {/* Netflix-style hover card */}
            {hoveredItem && hoveredItem.id === it.id && (
              <PosterHoverCard
                item={hoveredItem}
                onSelect={onSelect}
                isVisible={true}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Home({ searchResults, searching }: HomeProps) {
  const [trendingMovies, setTrendingMovies] = useState<CatalogItem[]>([]);
  const [trendingTv, setTrendingTv] = useState<CatalogItem[]>([]);
  const [newTv, setNewTv] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [continueWatching, setContinueWatching] = useState<GridItem[]>([]);

  // Removed automatic purgeTorrents() call – we now retain cached data for 24 h.

  useEffect(() => {
    Promise.all([
      getTrending("movie", 3),
      getTrending("tv", 3),
      getNewTv(),
    ])
      .then(([movies, tv, newTvItems]) => {
        setTrendingMovies(filterAnimeAndJapanese(filterKids(movies)));
        setTrendingTv(filterAnimeAndJapanese(filterUnwantedTvCategories(filterKids(tv))));
        setNewTv(filterAnimeAndJapanese(filterUnwantedTvCategories(filterKids(newTvItems))));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const progress = getAllProgress();
    
    // Filter and process progress entries
    const filteredProgress = progress
      .filter((p) => {
        // Only show unfinished items
        if (p.finished) return false;
        
        // Filter out items with less than 1 minute watch time (60 seconds)
        if (!p.watchedSeconds || p.watchedSeconds < 60) return false;
        
        // Filter out items with less than 2 minutes remaining (120 seconds)
        if (p.runtimeSeconds && p.watchedSeconds) {
          const remainingTime = p.runtimeSeconds - p.watchedSeconds;
          if (remainingTime < 120) return false;
        }
        
        return true;
      });
    
    // Group TV shows by show ID and keep only the most recently watched episode
    const groupedProgress = new Map<string, typeof filteredProgress[0]>();
    
    filteredProgress.forEach((p) => {
      if (p.media_type === "tv") {
        const key = `tv-${p.id}`;
        // Always update to the current episode since we're iterating through the array
        // in order, so later entries represent more recently watched episodes
        groupedProgress.set(key, p);
      } else {
        // For movies, just use the movie ID as key
        groupedProgress.set(`movie-${p.id}`, p);
      }
    });
    
    // Convert back to array and create GridItems
    const continueWatchingItems = Array.from(groupedProgress.values()).map((p) => {
      const label =
        p.media_type === "tv" && p.season && p.episode
          ? `Resume S${p.season}E${p.episode}`
          : "Resume";
      return {
        id: p.id,
        title: p.title,
        poster_path: p.poster_path,
        overview: "",
        media_type: p.media_type,
        resumeLabel: label,
      } as GridItem;
    });
    
    setContinueWatching(continueWatchingItems);
  }, []);

  function refreshProgress() {
    const progress = getAllProgress();
    
    // Filter and process progress entries (same logic as useEffect)
    const filteredProgress = progress
      .filter((p) => {
        // Only show unfinished items
        if (p.finished) return false;
        
        // Filter out items with less than 1 minute watch time (60 seconds)
        if (!p.watchedSeconds || p.watchedSeconds < 60) return false;
        
        // Filter out items with less than 2 minutes remaining (120 seconds)
        if (p.runtimeSeconds && p.watchedSeconds) {
          const remainingTime = p.runtimeSeconds - p.watchedSeconds;
          if (remainingTime < 120) return false;
        }
        
        return true;
      });
    
    // Group TV shows by show ID and keep only the most recently watched episode
    const groupedProgress = new Map<string, typeof filteredProgress[0]>();
    
    filteredProgress.forEach((p) => {
      if (p.media_type === "tv") {
        const key = `tv-${p.id}`;
        // Always update to the current episode since we're iterating through the array
        // in order, so later entries represent more recently watched episodes
        groupedProgress.set(key, p);
      } else {
        // For movies, just use the movie ID as key
        groupedProgress.set(`movie-${p.id}`, p);
      }
    });
    
    // Convert back to array and create GridItems
    const continueWatchingItems = Array.from(groupedProgress.values()).map((p) => {
      const label =
        p.media_type === "tv" && p.season && p.episode
          ? `Resume S${p.season}E${p.episode}`
          : "Resume";
      return {
        id: p.id,
        title: p.title,
        poster_path: p.poster_path,
        overview: "",
        media_type: p.media_type,
        resumeLabel: label,
      } as GridItem;
    });
    
    setContinueWatching(continueWatchingItems);
  }

  // We no longer short-circuit on loading; empty carousels will display their own skeletons

  return (
    <>
      {searchResults.length > 0 ? (
        <GridSection
          title={`Search Results (${searchResults.length})`}
          items={searchResults as GridItem[]}
          onSelect={setSelected}
        />
      ) : (
        <>
          {continueWatching.length > 0 && (
            <HorizontalCarousel
              title="Continue Watching"
              items={continueWatching}
              onSelect={setSelected}
            />
          )}
          <HorizontalCarousel
            title="Trending Movies"
            items={trendingMovies}
            onSelect={setSelected}
          />
          <HorizontalCarousel
            title="Trending TV"
            items={trendingTv}
            onSelect={setSelected}
          />
          <HorizontalCarousel
            title="New TV Releases"
            items={newTv}
            onSelect={setSelected}
          />
        </>
      )}

      {searching && <p className="status">Searching…</p>}

      {selected &&
        (selected.media_type === "tv" ? (
          <ShowModal
            item={selected}
            onClose={() => {
              setSelected(null);
              refreshProgress();
            }}
          />
        ) : (
          <Modal
            item={selected}
            onClose={() => {
              setSelected(null);
              refreshProgress();
            }}
          />
        ))}
    </>
  );
}

export default Home; 