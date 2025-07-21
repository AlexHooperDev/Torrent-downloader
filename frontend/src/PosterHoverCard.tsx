import { useState, useEffect } from "react";
import { CatalogItem, getMovieDetails, getShowDetails, MovieDetailsApi, ShowDetailsApi, getMovieVideos, getShowVideos, VideoItem } from "./api";
import "./PosterHoverCard.css";

interface PosterHoverCardProps<T extends CatalogItem> {
  item: T;
  onSelect: (item: T) => void;
  isVisible: boolean; // true when fully shown
  fadeOut?: boolean;  // true when exiting – triggers fade-out animation
  position?: { left: number; top: number; transform: string };
  onMouseEnter?: (event: React.MouseEvent) => void;
  onMouseLeave?: (event: React.MouseEvent) => void;
}

export default function PosterHoverCard<T extends CatalogItem>({ item, onSelect, isVisible, fadeOut = false, position, onMouseEnter, onMouseLeave }: PosterHoverCardProps<T>) {
  const [details, setDetails] = useState<MovieDetailsApi | ShowDetailsApi | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [videoKey, setVideoKey] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (isVisible && !details && !isLoading) {
      setIsLoading(true);
      const fetchDetails = item.media_type === "tv" 
        ? getShowDetails(item.id)
        : getMovieDetails(item.id);
      
      fetchDetails
        .then(setDetails)
        .catch(() => {
          // Fallback to basic item data if details fail
          setDetails(null);
        })
        .finally(() => setIsLoading(false));
    }
  }, [isVisible, item.id, item.media_type, details, isLoading]);

  // fetch videos lazily, play after 1s
  useEffect(() => {
    if (!isVisible) {
      setShowVideo(false);
      setVideoKey(null);
      return;
    }

    const timeout = setTimeout(() => {
      const fetchVideos = item.media_type === "tv" ? getShowVideos(item.id) : getMovieVideos(item.id);
      fetchVideos.then((videos: VideoItem[]) => {
        const trailer = videos.find((v) => v.site === "YouTube" && v.type === "Trailer");
        if (trailer) {
          setVideoKey(trailer.key);
          setShowVideo(true);
        }
      }).catch(() => {});
    }, 1000); // 1 second delay

    return () => clearTimeout(timeout);
  }, [isVisible, item.id, item.media_type]);

  const formatVoteAverage = (vote: number) => {
    return Math.round(vote * 10) / 10;
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  // Only hide completely when neither visible nor fading out
  if (!isVisible && !fadeOut) return null;

  const classes = ["poster-hover-card"];
  if (fadeOut) classes.push("fade-out");
 
  return (
    <div 
      className={classes.join(" ")} 
      onClick={() => onSelect(item)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={position ? {
        position: 'absolute',
        left: `${position.left}px`,
        top: `${position.top}px`,
        transform: position.transform,
        '--hover-transform': position.transform,
      } as React.CSSProperties & { '--hover-transform': string } : undefined}
    >
      {/* Backdrop/Poster Image or Video */}
      <div className="hover-card-image">
        {showVideo && videoKey ? (
          <>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&modestbranding=1&playsinline=1&loop=1&playlist=${videoKey}&rel=0&iv_load_policy=3&disablekb=1&fs=0&enablejsapi=1`}
              allow="autoplay; encrypted-media"
              allowFullScreen
              title="trailer"
              style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
            />
            <button
              className="mute-btn"
              onClick={(e) => {
                e.stopPropagation();
                setMuted((prev) => !prev);
              }}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="white">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="white">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              )}
            </button>
          </>
        ) : (
          <img
            src={`https://image.tmdb.org/t/p/w500${item.poster_path}`}
            alt={item.title}
          />
        )}
        {!showVideo && (
          <div className="hover-card-overlay">
            <button className="hover-play-btn">
              <span className="play-icon">▶</span>
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="hover-card-content">
        <div className="hover-card-header">
          <h3 className="hover-card-title">{item.title}</h3>
          <div className="hover-card-meta">
            {item.vote_average && (
              <span className="hover-card-rating">
                {formatVoteAverage(item.vote_average)}
              </span>
            )}
            {item.year && (
              <span className="hover-card-year">{item.year}</span>
            )}
            <span className="hover-card-type">
              {item.media_type === "tv" ? "TV Series" : "Movie"}
            </span>
          </div>
        </div>

        {/* Genres */}
        {details && "genres" in details && details.genres && details.genres.length > 0 && (
          <div className="hover-card-genres">
            {details.genres.slice(0, 3).map((genre, index) => (
              <span key={index} className="genre-tag">
                {genre}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        <p className="hover-card-description">
          {truncateText(item.overview || "No description available.", 160)}
        </p>

        {/* Runtime/Episodes info */}
        {details && (
          <div className="hover-card-additional">
            {"runtime" in details && details.runtime && (
              <span className="hover-card-runtime">{details.runtime}m</span>
            )}
            {"seasons" in details && details.seasons && (
              <span className="hover-card-seasons">
                {details.seasons.filter(s => s.season_number !== 0).length} Season{details.seasons.filter(s => s.season_number !== 0).length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 