import { useEffect, useState, useRef, useCallback } from "react";
import "./FilterControls.css";
import HorizontalCarousel from "./HorizontalCarousel";
import Modal from "./Modal";
import GridSection from "./GridSection";
import { CatalogItem, getGenres, discoverCatalog, GenreItem } from "./api";

function MoviesPage() {
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState<"popularity" | "rating" | "trending">("popularity");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"all" | "year" | "month">("all");
  const [selected, setSelected] = useState<CatalogItem | null>(null);

  // flag to detect if the user touched any filter control
  const [hasInteracted, setHasInteracted] = useState(false);

  const [trending, setTrending] = useState<CatalogItem[]>([]);
  const [genreTrendingRows, setGenreTrendingRows] = useState<Record<number, CatalogItem[]>>({});

  // Pagination / infinite scroll state
  const [pageNum, setPageNum] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);

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

  // Fetch a single page of discover results and apply filters
  const fetchPage = useCallback(async (page: number, replace = false) => {
    setLoadingMore(true);
    const fromDate =
      timeRange === "year"
        ? new Date(new Date().setFullYear(new Date().getFullYear() - 1))
            .toISOString()
            .split("T")[0]
        : timeRange === "month"
        ? new Date(new Date().setMonth(new Date().getMonth() - 1))
            .toISOString()
            .split("T")[0]
        : undefined;

    try {
      const raw = await discoverCatalog({
        media: "movie",
        genreId: selectedGenre,
        sort: sort as "popularity" | "rating",
        page,
        pages: 1,
        fromDate,
      });

      const filtered = filterAnimeAndJapanese(filterKids(raw));

      setItems((prev) => (replace ? filtered : [...prev, ...filtered]));

      // If we received less than 20 items, assume no more data
      if (filtered.length === 0) {
        setHasMore(false);
      } else {
        setHasMore(true);
        setPageNum(page);
      }
    } catch (_err) {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [selectedGenre, sort, timeRange]);

  // Intersection observer callback to load next page when sentinel is visible
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    if (loadingMore) return;
    if (observer.current) observer.current.disconnect();
    if (node) {
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          fetchPage(pageNum + 1);
        }
      }, { rootMargin: "200px" });
      observer.current.observe(node);
    }
  }, [hasMore, loadingMore, loading, pageNum, fetchPage]);

  // fetch genres on mount
  useEffect(() => {
    getGenres("movie").then(setGenres).catch(() => {});
  }, []);

  // fetch items when selectedGenre / sort / timeRange change after interaction
  useEffect(() => {
    if (!hasInteracted) return;

    // Handle Trending separately (no pagination for now)
    if (sort === "trending") {
      setLoading(true);
      setItems([]);
      import("./api")
        .then(({ getTrending }) => getTrending("movie"))
        .then((res) => {
          const filtered = filterAnimeAndJapanese(filterKids(res));
          setItems(filtered);
        })
        .finally(() => {
          setLoading(false);
          setHasMore(false);
        });
      return;
    }

    // Reset pagination state and load first page
    setLoading(true);
    setItems([]);
    setPageNum(1);
    setHasMore(true);

    (async () => {
      await fetchPage(1, true);
      setLoading(false);

      // Ensure at least 30 results if possible
      if (hasMore && items.length < 30) {
        await fetchPage(2);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGenre, sort, timeRange, hasInteracted]);

  // fetch trending when no filters
  useEffect(() => {
    if (hasInteracted || selectedGenre || timeRange !== "all") return;
    // trending row
    import("./api").then(({ getTrending }) => getTrending("movie")).then((res)=> setTrending(filterAnimeAndJapanese(filterKids(res))));
  }, [hasInteracted, selectedGenre, timeRange]);

  // fetch trending genre rows (popular genres)
  useEffect(() => {
    if (hasInteracted || selectedGenre || timeRange !== "all" || genres.length === 0) return;
    const preferredNames = ["Action", "Romance", "Comedy", "Thriller", "Drama", "Horror", "Crime", "Adventure"];
    const overviewGenres = genres.filter((g) => preferredNames.includes(g.name)).slice(0, 8);
    overviewGenres.forEach((g) => {
      discoverCatalog({ media: "movie", genreId: g.id, sort: "popularity" })
        .then((res) => {
          setGenreTrendingRows((prev) => ({ ...prev, [g.id]: filterAnimeAndJapanese(filterKids(res)) }));
        })
        .catch(() => {});
    });
  }, [genres, selectedGenre, timeRange, sort, hasInteracted]);

  return (
    <main style={{ padding: "1rem 1rem 1rem 4rem" }}>
      <h2 style={{ color: "#e5e5e5", fontSize: "2rem", fontWeight: "bold", marginBottom: "1.5rem" }}>Movies</h2>
      <div className="filter-controls">
        <label style={{ color: "#fff" }}>
          Genre:
          <select
            value={selectedGenre ?? ""}
            onChange={(e) => {
              setHasInteracted(true);
              const val = e.target.value;
              setSelectedGenre(val ? parseInt(val, 10) : undefined);
            }}
            style={{ marginLeft: "0.5rem" }}
          >
            <option value="">All</option>
            {genres.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ color: "#fff" }}>
          Sort by:
          <select
            value={sort}
            onChange={(e) => {
              setHasInteracted(true);
              setSort(e.target.value as any);
            }}
            style={{ marginLeft: "0.5rem" }}
          >
            <option value="popularity">Popularity</option>
            <option value="rating">Rating</option>
            <option value="trending">Trending</option>
          </select>
        </label>

        <label style={{ color: "#fff" }}>
          Time:
          <select value={timeRange} onChange={(e) => { setHasInteracted(true); setTimeRange(e.target.value as any); }} style={{ marginLeft: "0.5rem" }}>
            <option value="all">All time</option>
            <option value="year">Past Year</option>
            <option value="month">Past Month</option>
          </select>
        </label>
      </div>

      {hasInteracted ? (
        loading ? (
          <p style={{ color: "#fff" }}>Loading…</p>
        ) : (
          <>
            <GridSection title={`Results (${items.length})`} items={items} onSelect={setSelected} />
            {/* Sentinel div for infinite scrolling */}
            <div ref={sentinelRef} style={{ height: "1px" }} />
            {loadingMore && <p style={{ color: "#fff" }}>Loading more…</p>}
          </>
        )
      ) : (
        <>
          <HorizontalCarousel title="Trending" items={trending} onSelect={setSelected} nested />
          {genres
            .filter((g) => genreTrendingRows[g.id] && genreTrendingRows[g.id].length > 0)
            .map((g) => (
              <HorizontalCarousel key={g.id} title={g.name} items={genreTrendingRows[g.id]} onSelect={setSelected} nested />
            ))}
        </>
      )}
      {selected && (
        <Modal item={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}

export default MoviesPage; 