import { useEffect, useState, useRef } from "react";
import PosterHoverCard from "./PosterHoverCard";
import { CatalogItem } from "./api";

// Reusable grid section that displays catalog items in a responsive wrapping grid.
// It replicates the behaviour previously defined inline in Home.tsx so that other
// pages (MoviesPage, TvShowsPage, etc.) can reuse it instead of HorizontalCarousel
// when we want items to wrap to the next row instead of scrolling horizontally.

export interface GridItem extends CatalogItem {
  resumeLabel?: string;
}

interface GridSectionProps<T extends GridItem = GridItem> {
  title: string;
  items: T[];
  onSelect: (item: T) => void;
}

function GridSection<T extends GridItem>({ title, items, onSelect }: GridSectionProps<T>) {
  const [hoveredItem, setHoveredItem] = useState<T | null>(null);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);
  const [fadeOut, setFadeOut] = useState(false);
  const componentId = useRef(Math.random().toString(36).substring(2, 10));

  // Listen for global hovercard open events to close this section's card if needed
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
    return () => {
      window.removeEventListener('hovercard-open', handleExternalOpen);
    };
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

  const handleMouseEnter = (item: T) => {
    // Notify all other sections to close their cards
    window.dispatchEvent(new CustomEvent('hovercard-open', { detail: componentId.current }));

    // If switching to a different item, ensure we cancel fadeOut and show new card
    setFadeOut(false);
    // If a card is already visible, switch immediately to the new item
    if (hoveredItem) {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        setHoverTimeout(null);
      }
      setHoveredItem(item);
      return;
    }

    // Otherwise start a short delay to avoid flicker when simply passing cursor over cards
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
    }

    const timeout = setTimeout(() => {
      setHoveredItem(item);
    }, 500); // longer delay to prevent accidental hovers

    setHoverTimeout(timeout);
  };

  const handleMouseLeave = () => {
    // If hovercard is visible, start fade-out
    if (hoveredItem && !fadeOut) {
      setFadeOut(true);
      // Remove the card after animation duration (200ms)
      setTimeout(() => {
        setHoveredItem(null);
        setFadeOut(false);
      }, 200);
    }

    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
  };

  const handleHoverCardEnter = (_event: React.MouseEvent) => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
  };

  const handleHoverCardLeave = (event: React.MouseEvent) => {
    const related = event.relatedTarget as HTMLElement | null;
    if (related && related.closest && related.closest('.card')) {
      // Pointer moved back to a poster card – don't hide yet
      return;
    }

    // Start fade-out if not already
    if (hoveredItem && !fadeOut) {
      setFadeOut(true);
      setTimeout(() => {
        setHoveredItem(null);
        setFadeOut(false);
      }, 200);
    }
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
              alt={"title" in it ? (it.title as string) : "Item"}
            />
            <span className="overlay">{(it as any).resumeLabel || "Select"}</span>

            {hoveredItem && hoveredItem.id === it.id && (
              <PosterHoverCard
                key={hoveredItem.id}
                item={hoveredItem}
                onSelect={onSelect}
                isVisible={!fadeOut}
                fadeOut={fadeOut}
                onMouseEnter={handleHoverCardEnter}
                onMouseLeave={handleHoverCardLeave}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default GridSection; 