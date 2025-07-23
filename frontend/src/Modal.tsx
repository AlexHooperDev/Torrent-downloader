import { useEffect, useState } from "react";
import {
  CatalogItem,
  TorrentOption,
  getTorrentOptions,
  getMovieDetails,
  MovieDetailsApi,
} from "./api";
import FullscreenPlayer from "./FullscreenPlayer";
import SplashScreen from "./SplashScreen";
import { getProgress, updateProgress } from "./progress";
import { myListService } from "./myListService";
import "./Modal.css";

interface Props {
  item: CatalogItem;
  onClose: () => void;
}

export default function Modal({ item, onClose }: Props) {
  const [options, setOptions] = useState<TorrentOption[]>([]);
  const [loadingTorrents, setLoadingTorrents] = useState(false);
  const [details, setDetails] = useState<MovieDetailsApi | null>(null);
  const [noStreams, setNoStreams] = useState(false);
  const [playerSrc, setPlayerSrc] = useState<string | null>(null);
  const [playingOptions, setPlayingOptions] = useState<TorrentOption[]>([]);
  // Controls interim splash screen before player shows
  const [showSplash, setShowSplash] = useState(false);
  const [isInMyList, setIsInMyList] = useState(false);

  // Load stored progress for this movie (if any)
  const storedProgress = getProgress(item.id, "movie");

  // Check if item is in My List
  useEffect(() => {
    setIsInMyList(myListService.isInMyList(item.id));
  }, [item.id]);

  // Listen for My List updates
  useEffect(() => {
    const handleMyListUpdate = (event: CustomEvent) => {
      const { action, item: updatedItem, itemId } = event.detail;
      if (action === 'add' && updatedItem?.id === item.id) {
        setIsInMyList(true);
      } else if (action === 'remove' && itemId === item.id) {
        setIsInMyList(false);
      }
    };

    window.addEventListener('myListUpdated', handleMyListUpdate as EventListener);
    return () => window.removeEventListener('myListUpdated', handleMyListUpdate as EventListener);
  }, [item.id]);

  // Load movie details
  useEffect(() => {
    getMovieDetails(item.id).then(setDetails);
  }, [item.id]);

  // We now fetch torrents only when the user clicks Play/Resume

  // Helper to choose best torrent
  function chooseBestTorrent(opts: TorrentOption[]): TorrentOption | undefined {
    if (!opts || opts.length === 0) return undefined;
    const sortedByRatio = [...opts].sort((a, b) => (b.ratio || 0) - (a.ratio || 0));
    const hd = sortedByRatio.find((o) => /1080/i.test(o.quality || ""));
    return hd || sortedByRatio[0];
  }

  const handleAddToMyList = (e: React.MouseEvent) => {
    e.stopPropagation();
    myListService.toggleInMyList(item);
  };

  async function play(option?: TorrentOption) {
    if (loadingTorrents) return; // Prevent concurrent calls

    setNoStreams(false);
    setLoadingTorrents(true);

    try {
      // Ensure we have torrent options available (fetch once if necessary)
      let optsToUse: TorrentOption[] = options;
      if (optsToUse.length === 0) {
        optsToUse = await getTorrentOptions(item.title, item.year);
        setOptions(optsToUse); // cache for subsequent plays
      }

      if (!optsToUse.length) {
        setNoStreams(true);
        return;
      }

      const opt = option || chooseBestTorrent(optsToUse);
      if (!opt) {
        setNoStreams(true);
        return;
      }

      setPlayingOptions(optsToUse);
      const apiBase = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';
      setPlayerSrc(`${apiBase}/stream?magnet=${encodeURIComponent(opt.magnet || "")}`);
      // Show branded splash while player prepares
      setShowSplash(true);

      // Persist start progress
      updateProgress({
        id: item.id,
        media_type: "movie",
        title: item.title,
        poster_path: item.poster_path,
        finished: false,
        watchedSeconds: storedProgress?.watchedSeconds || 0,
        runtimeSeconds: runtimeMinutes * 60,
      });
    } finally {
      // Always turn the spinner off at the end
      setLoadingTorrents(false);
    }
  }

  // Truncate text to 30 words
  const truncateDescription = (text: string, maxWords = 30): string => {
    if (!text) return "";
    const words = text.trim().split(/\s+/);
    return words.length > maxWords ? words.slice(0, maxWords).join(" ") + "..." : text;
  };

  const runtimeMinutes = details?.runtime || 120; // fallback 2h

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal show-modal netflix-style"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close" onClick={onClose}>
          ×
        </button>

        {/* Netflix-style Hero Section */}
        {details && (
          <div
            className="netflix-hero"
            style={{
              backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 70%, rgba(20,20,20,0.8) 100%), url(https://image.tmdb.org/t/p/original${
                details.backdrop_path || details.poster_path || ""
              })`,
            }}
          >
            <div className="hero-content">
              <h1 className="show-title">{item.title}</h1>

              {/* Progress Bar and Time */}
              {storedProgress && storedProgress.watchedSeconds != null && (
                <div className="hero-progress-section">
                  <div className="hero-progress-bar">
                    <div
                      className="hero-progress-fill"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.floor((storedProgress.watchedSeconds! / (runtimeMinutes * 60)) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="hero-progress-text">
                    {Math.floor(storedProgress.watchedSeconds! / 60)} of {runtimeMinutes}m
                  </span>
                </div>
              )}

              <div className="hero-actions">
                <button
                  className="netflix-play-btn"
                  onClick={() => play()}
                  disabled={loadingTorrents}
                >
                  {loadingTorrents ? (
                    <div className="loading-spinner-sm" />
                  ) : (
                    <span className="play-icon">▶</span>
                  )}
                  {loadingTorrents
                    ? "Loading"
                    : storedProgress && storedProgress.watchedSeconds
                    ? "Resume"
                    : "Play"}
                </button>
                <button
                  className="netflix-circle-btn netflix-my-list-btn"
                  onClick={handleAddToMyList}
                  disabled={loadingTorrents}
                  aria-label={isInMyList ? "Remove from My List" : "Add to My List"}
                  title={isInMyList ? "Remove from My List" : "Add to My List"}
                >
                  {isInMyList ? (
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content Container */}
        {details && (
          <div className="netflix-content-container">
            <div className="show-info-section">
              <div className="show-details">
                <div className="show-year-seasons">
                  <span className="show-year">{item.year || (details.release_date || "").split("-")[0]}</span>
                </div>

                <div className="show-rating-tags">
                  {item.vote_average && (
                    <span className="show-rating">{item.vote_average.toFixed(1)}</span>
                  )}
                  <span className="show-tags">{runtimeMinutes}m</span>
                </div>

                {/* Movie Description */}
                <p className="current-episode-description">
                  {truncateDescription(details.overview, 40)}
                </p>
              </div>

              {/* Cast and Meta Info */}
              <div className="show-meta-sidebar">
                <div className="meta-row">
                  <span className="meta-label">Cast:</span>
                  <span className="meta-value">{(details.cast || []).join(", ")}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Genres:</span>
                  <span className="meta-value">{(details.genres || []).join(", ")}</span>
                </div>
              </div>
            </div>

            {/* Torrent status */}
            {noStreams && !loadingTorrents && (
              <p className="loading-text" style={{ color: "#e50914" }}>
                No streams found
              </p>
            )}
          </div>
        )}

        {playerSrc && (
          <FullscreenPlayer
            src={playerSrc}
            title={`${item.title} (${item.year})`}
            runtime={runtimeMinutes}
            torrentOptions={playingOptions}
            onClose={() => setPlayerSrc(null)}
            onTimeUpdate={(currentTime) => {
              updateProgress({
                id: item.id,
                media_type: "movie",
                title: item.title,
                poster_path: item.poster_path,
                finished: false,
                watchedSeconds: Math.floor(currentTime),
                runtimeSeconds: runtimeMinutes * 60,
              });
            }}
            onEnded={() => {
              updateProgress({
                id: item.id,
                media_type: "movie",
                title: item.title,
                poster_path: item.poster_path,
                finished: true,
                runtimeSeconds: runtimeMinutes * 60,
              });
              setPlayerSrc(null);
            }}
            initialTime={storedProgress?.watchedSeconds || 0}
          />
        )}

        {showSplash && (
          <SplashScreen onComplete={() => setShowSplash(false)} />
        )}
      </div>
    </div>
  );
} 