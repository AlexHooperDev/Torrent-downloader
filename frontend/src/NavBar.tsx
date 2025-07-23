import { NavLink } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import "./NavBar.css";

interface NavBarProps {
  query?: string;
  onQueryChange?: (q: string) => void;
  clearQuery?: () => void;
}

function NavBar({ query = "", onQueryChange, clearQuery }: NavBarProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  function handleToggle() {
    setOpen((prev) => !prev);
  }

  function handleBlur() {
    // Close if no query text
    if (!query) setOpen(false);
  }

  function handleLogoClick() {
    if (clearQuery) {
      clearQuery();
    }
    setOpen(false);
  }

  function handleNavClick() {
    if (clearQuery) {
      clearQuery();
    }
    setOpen(false);
  }

  return (
    <nav className="navbar">
      <div className="logo-wrap">
        <NavLink to="/" onClick={handleLogoClick}>
          <img src="/hoopflix-logo.png" alt="HoopFlix" className="logo" />
        </NavLink>
      </div>
      <ul className="nav-links">
        <li>
          <NavLink to="/" end className={({ isActive }: { isActive: boolean }) => (isActive ? "active" : undefined)} onClick={handleLogoClick}>
            Home
          </NavLink>
        </li>
        <li>
          <NavLink to="/tv" className={({ isActive }: { isActive: boolean }) => (isActive ? "active" : undefined)} onClick={handleNavClick}>
            TV Shows
          </NavLink>
        </li>
        <li>
          <NavLink to="/movies" className={({ isActive }: { isActive: boolean }) => (isActive ? "active" : undefined)} onClick={handleNavClick}>
            Movies
          </NavLink>
        </li>
        <li>
          <NavLink to="/my-list" className={({ isActive }: { isActive: boolean }) => (isActive ? "active" : undefined)} onClick={handleNavClick}>
            My List
          </NavLink>
        </li>
      </ul>

      {onQueryChange && (
        <div className={`nav-search ${open ? "open" : ""}`}>
          <button className="search-icon" onClick={handleToggle} type="button" aria-label="Search">
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <line x1="16.65" y1="16.65" x2="22" y2="22" />
            </svg>
          </button>
          <input
            ref={inputRef}
            type="text"
            placeholder="Titles, people, genres"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onBlur={handleBlur}
          />
          {query && clearQuery && (
            <button type="button" onClick={clearQuery} className="clear-btn">
              ×
            </button>
          )}
        </div>
      )}
    </nav>
  );
}

export default NavBar; 