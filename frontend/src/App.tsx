import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import NavBar from "./NavBar";
import Home from "./Home";
import MoviesPage from "./MoviesPage";
import TvShowsPage from "./TvShowsPage";
import { CatalogItem, searchCatalog } from "./api";

function AppContent() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogItem[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Debounced search whenever query changes
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    // Navigate to home when searching from other pages
    if (location.pathname !== "/") {
      navigate("/");
    }

    setSearching(true);
    const id = setTimeout(() => {
      searchCatalog(q)
        .then(setSearchResults)
        .finally(() => setSearching(false));
    }, 400);

    return () => clearTimeout(id);
  }, [query, navigate, location.pathname]);

  function clearQuery() {
    setQuery("");
    setSearchResults([]);
  }

  return (
    <>
      <NavBar
        query={query}
        onQueryChange={setQuery}
        clearQuery={clearQuery}
      />
      <Routes>
        <Route
          path="/"
          element={<Home searchResults={searchResults} searching={searching} />}
        />
        <Route path="/movies" element={<MoviesPage />} />
        <Route path="/tv" element={<TvShowsPage />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App; 