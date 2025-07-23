import { useEffect, useState, useRef, useCallback } from "react";
import HorizontalCarousel from "./HorizontalCarousel";
import ShowModal from "./ShowModal";
import GridSection from "./GridSection";
import { CatalogItem, getGenres, discoverCatalog, GenreItem } from "./api";
import "./FilterControls.css";

const KID_GENRE_IDS = [16, 10751, 10762];
// Filter out Talk, Reality, News, and Soap categories
const UNWANTED_TV_GENRE_IDS = [10767, 10764, 10763, 10766]; // Talk, Reality, News, Soap

function filterKids(items: CatalogItem[]): CatalogItem[] {
  return items.filter((it: any) => {
    const ids: number[] | undefined = it.genre_ids;
    if (ids && ids.some((id) => KID_GENRE_IDS.includes(id))) return false;
    const names: string[] | undefined = it.genres;
    if (names && names.some((n) => ["Animation", "Family", "Kids"].includes(n))) return false;
    return true;
  });
}

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
      "spirited away", "totoro", "princess mononoke"
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

function TvShowsPage() {
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState<"popularity" | "rating" | "trending">("popularity");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"all" | "year" | "month">("all");
  const [selected, setSelected] = useState<CatalogItem | null>(null);

  // flag to know if user used the filter controls
  const [hasInteracted, setHasInteracted] = useState(false);

  const [trending, setTrending] = useState<CatalogItem[]>([]);
  const [genreTrendingRows, setGenreTrendingRows] = useState<Record<number, CatalogItem[]>>({});

  // Pagination / infinite scroll
  const [pageNum, setPageNum] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);

  // Fetch a single page of discover results and apply filters
  const fetchPage = useCallback(
    async (page: number, replace = false) => {
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
          media: "tv",
          genreId: selectedGenre,
          sort: sort as "popularity" | "rating",
          page,
          pages: 1,
          fromDate,
        });

        const filtered = filterAnimeAndJapanese(
          filterUnwantedTvCategories(filterKids(raw))
        );

        setItems((prev) => (replace ? filtered : [...prev, ...filtered]));

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
    },
    [selectedGenre, sort, timeRange]
  );

  // IntersectionObserver sentinel
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loadingMore) return;
      if (observer.current) observer.current.disconnect();
      if (node) {
        observer.current = new IntersectionObserver(
          (entries) => {
            if (
              entries[0].isIntersecting &&
              hasMore &&
              !loadingMore &&
              !loading
            ) {
              fetchPage(pageNum + 1);
            }
          },
          { rootMargin: "200px" }
        );
        observer.current.observe(node);
      }
    },
    [hasMore, loadingMore, loading, pageNum, fetchPage]
  );

  useEffect(() => {
    getGenres("tv").then(setGenres).catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasInteracted) return;

    // Trending filter (no pagination for now)
    if (sort === "trending") {
      setLoading(true);
      setItems([]);
      import("./api")
        .then(({ getTrending }) => getTrending("tv"))
        .then((res) => {
          const filtered = filterAnimeAndJapanese(
            filterUnwantedTvCategories(filterKids(res))
          );
          setItems(filtered);
        })
        .finally(() => {
          setLoading(false);
          setHasMore(false);
        });
      return;
    }

    // Reset state and load first page
    setLoading(true);
    setItems([]);
    setPageNum(1);
    setHasMore(true);

    (async () => {
      await fetchPage(1, true);
      setLoading(false);

      if (hasMore && items.length < 30) {
        await fetchPage(2);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGenre, sort, timeRange, hasInteracted]);

  useEffect(() => {
    if (hasInteracted || selectedGenre || timeRange !== "all") return;
    import("./api").then(({ getTrending }) => getTrending("tv")).then((res)=> setTrending(filterAnimeAndJapanese(filterUnwantedTvCategories(filterKids(res)))));
  }, [hasInteracted, selectedGenre, timeRange, genres.length]);

  useEffect(() => {
    if (hasInteracted || selectedGenre || timeRange !== "all" || genres.length === 0) return;
    const preferredNames = ["Action & Adventure", "Drama", "Comedy", "Crime", "Thriller", "Mystery", "Sci-Fi & Fantasy", "Horror"];
    const overviewGenres = genres.filter((g) => preferredNames.includes(g.name)).slice(0, 8);
    overviewGenres.forEach((g) => {
      discoverCatalog({ media: "tv", genreId: g.id, sort: "popularity" })
        .then((res) => {
          setGenreTrendingRows((prev) => ({ ...prev, [g.id]: filterAnimeAndJapanese(filterUnwantedTvCategories(filterKids(res))) }));
        })
        .catch(() => {});
    });
  }, [genres, selectedGenre, timeRange, hasInteracted]);

  return (
    <main style={{ padding: "1rem 1rem 1rem 4rem" }}>
      <h2 style={{ color: "#e5e5e5", fontSize: "2rem", fontWeight: "bold", marginBottom: "1.5rem" }}>TV Shows</h2>
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
        <ShowModal item={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}

export default TvShowsPage; 