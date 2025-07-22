import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import NavBar from "./NavBar";
import Home from "./Home";
import MoviesPage from "./MoviesPage";
import TvShowsPage from "./TvShowsPage";
import SplashScreen from "./SplashScreen";
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
  const [showSplash, setShowSplash] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user has seen the intro before
    const hasSeenIntro = localStorage.getItem('hoopflix-intro-seen');
    
    if (!hasSeenIntro) {
      setShowSplash(true);
    }
    setIsLoading(false);
  }, []);

  const handleSplashComplete = () => {
    // Mark that user has seen the intro
    localStorage.setItem('hoopflix-intro-seen', 'true');
    setShowSplash(false);
  };

  // Don't render anything while checking localStorage
  if (isLoading) {
    return null;
  }

  // Show splash screen for first-time visitors
  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  // Show main app
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App; 