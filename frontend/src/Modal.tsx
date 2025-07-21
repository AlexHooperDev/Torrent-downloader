import { useEffect, useState } from "react";
import {
  CatalogItem,
  TorrentOption,
  getTorrentOptions,
  getMovieDetails,
  MovieDetailsApi,
} from "./api";
import FullscreenPlayer from "./FullscreenPlayer";
import { getProgress, updateProgress } from "./progress";
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

  // Load stored progress for this movie (if any)
  const storedProgress = getProgress(item.id, "movie");

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

  async function play(option?: TorrentOption) {
    if (loadingTorrents) return; // guard
    setNoStreams(false);

    // If we haven't fetched torrents yet, fetch them now
    if (options.length === 0) {
      setLoadingTorrents(true);
      try {
        const fetched = await getTorrentOptions(item.title, item.year);
        setOptions(fetched);
      } finally {
        setLoadingTorrents(false);
      }
    }

    const optsToUse = options.length ? options : await getTorrentOptions(item.title, item.year);

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
    setPlayerSrc(`http://localhost:3000/stream?magnet=${encodeURIComponent(opt.magnet || "")}`);

    // Persist start progress
    updateProgress({
      id: item.id,
      media_type: "movie",
      title: item.title,
      poster_path: item.poster_path,
      finished: false,
      watchedSeconds: storedProgress?.watchedSeconds || 0,
    });
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
              });
            }}
            onEnded={() => {
              updateProgress({
                id: item.id,
                media_type: "movie",
                title: item.title,
                poster_path: item.poster_path,
                finished: true,
              });
              setPlayerSrc(null);
            }}
            initialTime={storedProgress?.watchedSeconds || 0}
          />
        )}
      </div>
    </div>
  );
} 