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
            <span className="overlay">{it.resumeLabel || "Select"}</span>
            
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
        setTrendingMovies(filterKids(movies));
        setTrendingTv(filterKids(tv));
        setNewTv(filterKids(newTvItems));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const progress = getAllProgress();
    setContinueWatching(
      progress
        .filter((p) => !p.finished)
        .map((p) => {
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
        })
    );
  }, []);

  function refreshProgress() {
    const progress = getAllProgress();
    setContinueWatching(
      progress
        .filter((p) => !p.finished)
        .map((p) => {
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
        })
    );
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