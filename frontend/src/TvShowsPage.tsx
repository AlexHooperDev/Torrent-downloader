import { useEffect, useState } from "react";
import HorizontalCarousel from "./HorizontalCarousel";
import ShowModal from "./ShowModal";
import GridSection from "./GridSection";
import { CatalogItem, getGenres, discoverCatalog, GenreItem } from "./api";
import "./FilterControls.css";

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

  useEffect(() => {
    getGenres("tv").then(setGenres).catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasInteracted) return;

    // Trending filter
    if (sort === "trending") {
      setLoading(true);
      import("./api").then(({ getTrending }) => getTrending("tv")).then((res) => {
        setItems(res);
      }).finally(() => setLoading(false));
      return;
    }

    setLoading(true);
    const fromDate = timeRange === "year" ? new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split("T")[0] : timeRange === "month" ? new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split("T")[0] : undefined;
    discoverCatalog({ media: "tv", genreId: selectedGenre, sort: sort as "popularity" | "rating", fromDate })
      .then((res) => {
        console.log("TV discover results", { genre: selectedGenre, sort, timeRange, count: res.length, res });
        setItems(res);
      })
      .finally(() => setLoading(false));
  }, [selectedGenre, sort, timeRange, hasInteracted]);

  useEffect(() => {
    if (hasInteracted || selectedGenre || timeRange !== "all") return;
    import("./api").then(({ getTrending }) => getTrending("tv")).then((res)=> setTrending(filterKids(res)));
  }, [hasInteracted, selectedGenre, timeRange]);

  useEffect(() => {
    if (hasInteracted || selectedGenre || timeRange !== "all" || genres.length === 0) return;
    const preferredNames = ["Action & Adventure", "Drama", "Comedy"];
    const overviewGenres = genres.filter((g) => preferredNames.includes(g.name)).slice(0, 3);
    overviewGenres.forEach((g) => {
      discoverCatalog({ media: "tv", genreId: g.id, sort: "popularity" })
        .then((res) => {
          setGenreTrendingRows((prev) => ({ ...prev, [g.id]: filterKids(res) }));
        })
        .catch(() => {});
    });
  }, [genres, selectedGenre, timeRange, hasInteracted]);

  return (
    <main style={{ padding: "1rem 1rem 1rem 4rem" }}>
      <h2 style={{ color: "#e5e5e5", marginLeft: "0.5rem" }}>TV Shows</h2>
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
          <GridSection title={`Results (${items.length})`} items={items} onSelect={setSelected} />
        )
      ) : (
        <>
          <HorizontalCarousel title="Trending" items={trending} onSelect={setSelected} />
          {genres
            .filter((g) => genreTrendingRows[g.id] && genreTrendingRows[g.id].length > 0)
            .map((g) => (
              <HorizontalCarousel key={g.id} title={g.name} items={genreTrendingRows[g.id]} onSelect={setSelected} />
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