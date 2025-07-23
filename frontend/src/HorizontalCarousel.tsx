import { useRef, useState, useEffect } from "react";
import "./HorizontalCarousel.css";
import { CatalogItem } from "./api";
import PosterHoverCard from "./PosterHoverCard";

interface HorizontalCarouselProps<T extends CatalogItem> {
  title: string;
  items: T[];
  onSelect: (item: T) => void;
  nested?: boolean; // When true, reduces left padding for pages that already have padding
}

function HorizontalCarousel<T extends CatalogItem>({ title, items, onSelect, nested = false }: HorizontalCarouselProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<T | null>(null);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);
  // Track which images have finished loading to display them only after load
  const [loadedMap, setLoadedMap] = useState<Record<number, boolean>>({});
  const [fadeOut, setFadeOut] = useState(false);
  const [hoverPosition, setHoverPosition] = useState<{ left: number; top: number; transform: string } | null>(null);
  const componentId = useRef(Math.random().toString(36).substring(2, 10));

  // listen to global open to close others
  useEffect(() => {
    function handleExternalOpen(event: Event) {
      const detailId = (event as CustomEvent<string>).detail;
      if (detailId !== componentId.current) {
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
          setHoverTimeout(null);
        }
        setHoveredItem(null);
        setHoverPosition(null);
        setFadeOut(false);
      }
    }
    window.addEventListener('hovercard-open', handleExternalOpen);
    return () => window.removeEventListener('hovercard-open', handleExternalOpen);
  }, [hoverTimeout]);

  // Determine if scrolling is possible and update scroll direction states
  useEffect(() => {
    function checkScrollability() {
      const el = scrollerRef.current;
      if (!el) return;
      
      const hasOverflow = el.scrollWidth > el.clientWidth + 1; // +1 to avoid rounding issues
      setCanScroll(hasOverflow);
      
      if (hasOverflow) {
        updateScrollStates();
      } else {
        setCanScrollLeft(false);
        setCanScrollRight(false);
      }
    }
    
    function updateScrollStates() {
      const el = scrollerRef.current;
      if (!el) return;
      
      const scrollLeft = el.scrollLeft;
      const maxScrollLeft = el.scrollWidth - el.clientWidth;
      
      setCanScrollLeft(scrollLeft > 1); // Small threshold to avoid floating point issues
      setCanScrollRight(scrollLeft < maxScrollLeft - 1);
    }
    
    checkScrollability();
    
    const el = scrollerRef.current;
    if (el) {
      el.addEventListener("scroll", updateScrollStates);
    }
    
    window.addEventListener("resize", checkScrollability);
    
    return () => {
      if (el) {
        el.removeEventListener("scroll", updateScrollStates);
      }
      window.removeEventListener("resize", checkScrollability);
    };
  }, [items]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }
    };
  }, [hoverTimeout]);

  const isLoading = items.length === 0;

  function scroll(direction: "left" | "right") {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8; // scroll ~80% of visible width
    el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
  }

  const handleMouseEnter = (item: T, event: React.MouseEvent) => {
    // Broadcast that this carousel is opening a card
    window.dispatchEvent(new CustomEvent('hovercard-open', { detail: componentId.current }));

    // If a card is already open, switch instantly
    if (hoveredItem) {
      setFadeOut(false);
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        setHoverTimeout(null);
      }
      setHoveredItem(item);
      // Position calculation remains below
    } else {
      // Clear any existing timeout and start a short delay to avoid flicker
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }

      const timeout = setTimeout(() => {
        setHoveredItem(item);
      }, 500);

      setHoverTimeout(timeout);
    }
    
    // Check if we're near the right edge where the arrow would appear
    const cardElement = event.currentTarget as HTMLElement;
    const scrollerElement = scrollerRef.current;
    if (cardElement && scrollerElement) {
      const cardRect = cardElement.getBoundingClientRect();
      const scrollerRect = scrollerElement.getBoundingClientRect();
      const rightEdgeDistance = scrollerRect.right - cardRect.right;
      
      // Don't show hover card if we're within 60px of the right edge (arrow area)
      if (canScrollRight && rightEdgeDistance < 60) {
        return;
      }
      
      // Calculate position relative to the wrapper for hover card positioning
      const wrapperElement = scrollerElement.parentElement;
      if (wrapperElement) {
        const wrapperRect = wrapperElement.getBoundingClientRect();
        const relativeLeft = cardRect.left - wrapperRect.left;
        const relativeTop = cardRect.top - wrapperRect.top;
        
        // Find card index for edge detection
        const cardIndex = Array.from(scrollerElement.children).indexOf(cardElement);
        const totalCards = scrollerElement.children.length;
        
        // Smart positioning to prevent clipping off screen edges
        let finalLeft = relativeLeft + (cardRect.width / 2); // Default: center on card
        let transform = 'translateX(-50%)'; // Default: center transform
        
        // Check if card is near left edge (first 2 cards)
        if (cardIndex < 2) {
          finalLeft = relativeLeft; // Align to left edge of card
          transform = 'translateX(0)'; // No centering transform
        }
        // Check if card is near right edge (last 2 cards) 
        else if (cardIndex >= totalCards - 2) {
          finalLeft = relativeLeft + cardRect.width; // Align to right edge of card
          transform = 'translateX(-100%)'; // Align to right
        }
        // Additional viewport clipping check
        else {
          const hoverCardWidth = 380; // From CSS
          const leftEdge = cardRect.left - (hoverCardWidth / 2);
          const rightEdge = cardRect.right + (hoverCardWidth / 2);
          
          if (leftEdge < 20) { // Too close to left viewport edge
            finalLeft = relativeLeft;
            transform = 'translateX(0)';
          } else if (rightEdge > window.innerWidth - 20) { // Too close to right viewport edge
            finalLeft = relativeLeft + cardRect.width;
            transform = 'translateX(-100%)';
          }
        }
        
        setHoverPosition({
          left: finalLeft,
          top: relativeTop - 80, // Position above the card like before
          transform
        });
      }
    }
    
    // Note: position calculation above remains unchanged and is needed
  };

  const handleMouseLeave = (event: React.MouseEvent) => {
    // If we are moving into the hover card, do NOT hide
    const related = event.relatedTarget as HTMLElement | null;
    if (related && related.closest && related.closest('.poster-hover-card')) {
      return; // pointer entered the hover card – keep it visible
    }

    // Clear any pending timeout first
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }

    if (hoveredItem && !fadeOut) {
      setFadeOut(true);
      // Delay actual removal until after animation (~200ms)
      const hideTimeout = setTimeout(() => {
        setHoveredItem(null);
        setHoverPosition(null);
        setFadeOut(false);
      }, 200);

      setHoverTimeout(hideTimeout);
    }
  };

  const handleHoverCardEnter = (_event: React.MouseEvent) => {
    // Clear any pending hide timeout when entering the hover card
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
  };

  const handleHoverCardLeave = (event: React.MouseEvent) => {
    // If moving back to the poster card, don't hide yet
    const related = event.relatedTarget as HTMLElement | null;
    if (related && related.closest && related.closest('.hcarousel-card')) {
      return;
    }

    if (hoveredItem && !fadeOut) {
      setFadeOut(true);
      setTimeout(() => {
        setHoveredItem(null);
        setHoverPosition(null);
        setFadeOut(false);
      }, 200);
    }
  };

  return (
    <section className={`hcarousel ${nested ? 'hcarousel-nested' : ''}`}>
      <h2>{title}</h2>
      <div className="hcarousel-wrapper">
        {!isLoading && canScrollLeft && (
          <button className="arrow left" onClick={() => scroll("left")} aria-label="Previous">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15,18 9,12 15,6"></polyline>
            </svg>
          </button>
        )}
        <div className="hcarousel-scroller" ref={scrollerRef}>
          {isLoading
            ? Array.from({ length: 10 }).map((_, idx) => (
                <div key={`sk-${idx}`} className="hcarousel-card">
                  <div className="skeleton" />
                </div>
              ))
            : items.map((it) => (
                <div 
                  key={`${title}-${it.id}`} 
                  className="hcarousel-card" 
                  onMouseEnter={(event) => handleMouseEnter(it, event)}
                  onMouseLeave={handleMouseLeave}
                  onClick={() => onSelect(it)}
                >
                  {/* Skeleton placeholder shown until the image finishes loading */}
                  {!loadedMap[it.id] && <div className="skeleton" />}
                  <img
                    src={`https://image.tmdb.org/t/p/w342${it.poster_path}`}
                    alt={"title" in it ? (it.title as string) : "Item"}
                    onLoad={() => setLoadedMap((prev) => ({ ...prev, [it.id]: true }))}
                    style={{ display: loadedMap[it.id] ? "block" : "none" }}
                  />
                </div>
              ))}
        </div>
        {!isLoading && canScrollRight && (
          <button className="arrow right" onClick={() => scroll("right")} aria-label="Next">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9,18 15,12 9,6"></polyline>
            </svg>
          </button>
        )}
        
        {/* Hover card rendered outside scroller to avoid clipping */}
        {hoveredItem && hoverPosition && (
          <PosterHoverCard
            key={hoveredItem.id}
            item={hoveredItem}
            onSelect={onSelect}
            isVisible={!fadeOut}
            fadeOut={fadeOut}
            position={hoverPosition}
            onMouseEnter={handleHoverCardEnter}
            onMouseLeave={handleHoverCardLeave}
          />
        )}
      </div>
    </section>
  );
}

export default HorizontalCarousel; 