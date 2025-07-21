import { useEffect, useState } from "react";
import {
  CatalogItem,
  SeasonInfo,
  EpisodeInfo,
  getShowDetails,
  getSeasonEpisodes,
  getEpisodeTorrentOptions,
  TorrentOption,
} from "./api";
import { getProgress, updateProgress } from "./progress";
import FullscreenPlayer from "./FullscreenPlayer";
import "./Modal.css";

interface Props {
  item: CatalogItem; // media_type === "tv"
  onClose: () => void;
}

interface ShowDetails {
  id: number;
  name: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  seasons: SeasonInfo[];
  genres?: string[];
  cast?: string[];
  episode_run_time?: number[];
}

export default function ShowModal({ item, onClose }: Props) {
  const [details, setDetails] = useState<ShowDetails | null>(null);
  const [currentSeason, setCurrentSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<EpisodeInfo | null>(null);
  const [torrentOptions, setTorrentOptions] = useState<TorrentOption[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [loadingTorrents, setLoadingTorrents] = useState(false);
  const [playerSrc, setPlayerSrc] = useState<string | null>(null);
  const [playingEpisode, setPlayingEpisode] = useState<EpisodeInfo | null>(null);
  const [playingOptions, setPlayingOptions] = useState<TorrentOption[]>([]); // track options passed to player
  const [loadingEpisodeId, setLoadingEpisodeId] = useState<number | null>(null); // episode currently loading
  const [unavailableEpisodes, setUnavailableEpisodes] = useState<number[]>([]);

  // Load stored progress for this show (if any)
  const storedProgress = getProgress(item.id, "tv");

  // Load show details
  useEffect(() => {
    getShowDetails(item.id).then((d) => {
      setDetails(d);
      // Exclude season 0 (specials) from UI/selection
      const validSeasons = d.seasons.filter((s) => s.season_number !== 0);
      if (validSeasons.length > 0) {
        if (
          storedProgress?.season &&
          storedProgress.season !== 0 &&
          validSeasons.some((s) => s.season_number === storedProgress.season)
        ) {
          setCurrentSeason(storedProgress.season);
        } else {
          // Choose first real season (smallest season_number > 0)
          const first = [...validSeasons].sort((a, b) => a.season_number - b.season_number)[0];
          setCurrentSeason(first.season_number);
        }
      }
    });
  }, [item.id]);

  // Load episodes when season changes
  useEffect(() => {
    if (currentSeason == null) return;
    setLoadingEpisodes(true);
    getSeasonEpisodes(item.id, currentSeason)
      .then((eps) => {
        setEpisodes(eps);
        if (eps.length) {
          // If we have stored progress and it matches this season, select the stored episode.
          if (
            storedProgress &&
            storedProgress.season === currentSeason &&
            storedProgress.episode
          ) {
            const found = eps.find((e) => e.episode_number === storedProgress.episode);
            if (found) {
              setSelectedEpisode(found);
              return;
            }
          }
          // Otherwise default to first episode in season (lowest episode_number)
          const first = [...eps].sort((a, b) => a.episode_number - b.episode_number)[0];
          setSelectedEpisode(first);
        }
      })
      .finally(() => setLoadingEpisodes(false));
  }, [currentSeason, item.id]);

  // Load torrents when selectedEpisode changes
  useEffect(() => {
    if (!selectedEpisode) return;
    setLoadingTorrents(true);
    getEpisodeTorrentOptions(item.title, selectedEpisode.season_number, selectedEpisode.episode_number, item.year).then(setTorrentOptions).finally(() => setLoadingTorrents(false));
  }, [selectedEpisode, item.title, item.year]);

  // Reset unavailable episodes when season changes
  useEffect(() => {
    setUnavailableEpisodes([]);
  }, [currentSeason]);

  // Helper to choose best torrent (1080 preference)
  function chooseBestTorrent(opts: TorrentOption[]): TorrentOption | undefined {
    if (!opts || opts.length === 0) return undefined;
    const sortedByRatio = [...opts].sort((a, b) => (b.ratio || 0) - (a.ratio || 0));
    const hd = sortedByRatio.find((o) => /1080/i.test(o.quality || ""));
    return hd || sortedByRatio[0];
  }

  function play(option?: TorrentOption) {
    const opt = option || chooseBestTorrent(torrentOptions);
    if (!opt) return;
    setPlayingOptions(torrentOptions);
    setPlayerSrc(
      `http://localhost:3000/stream?magnet=${encodeURIComponent(opt.magnet || "")}`
    );
    setPlayingEpisode(selectedEpisode);

    // Persist start progress
    if (selectedEpisode) {
      updateProgress({
        id: item.id,
        media_type: "tv",
        title: item.title,
        poster_path: item.poster_path,
        season: selectedEpisode.season_number,
        episode: selectedEpisode.episode_number,
      });
    }
  }

  // Function to play an episode directly (used by episode play buttons)
  async function playEpisode(episode: EpisodeInfo) {
    setLoadingEpisodeId(episode.id);
    setSelectedEpisode(episode);
    setLoadingTorrents(true);
    
    try {
      const torrents = await getEpisodeTorrentOptions(item.title, episode.season_number, episode.episode_number, item.year);
      setTorrentOptions(torrents);
      const best = chooseBestTorrent(torrents);
      if (!best) {
        setUnavailableEpisodes(prev => prev.includes(episode.id) ? prev : [...prev, episode.id]);
        return; // Exit early if no torrent found
      }
      if (best) {
        setPlayingOptions(torrents);
        setPlayerSrc(
          `http://localhost:3000/stream?magnet=${encodeURIComponent(best.magnet || "")}`
        );
        setPlayingEpisode(episode);

        // Persist start progress
        updateProgress({
          id: item.id,
          media_type: "tv",
          title: item.title,
          poster_path: item.poster_path,
          season: episode.season_number,
          episode: episode.episode_number,
        });
      }
    } finally {
      setLoadingTorrents(false);
      setLoadingEpisodeId(null);
    }
  }

  // Get current episode for hero display
  const getCurrentEpisode = () => {
    if (storedProgress?.season && storedProgress?.episode) {
      return episodes.find(ep => 
        ep.season_number === storedProgress.season && 
        ep.episode_number === storedProgress.episode
      );
    }
    return selectedEpisode;
  };

  // Truncate text to 25 words
  const truncateDescription = (text: string, maxWords = 25): string => {
    if (!text) return "";
    const words = text.trim().split(/\s+/);
    return words.length > maxWords ? words.slice(0, maxWords).join(" ") + "..." : text;
  };

  const currentEpisode = getCurrentEpisode();

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
              {storedProgress && currentEpisode && currentEpisode.runtime && storedProgress.watchedSeconds != null && (
                <div className="hero-progress-section">
                  <div className="hero-progress-bar">
                    <div 
                      className="hero-progress-fill" 
                      style={{ width: `${Math.min(100, Math.floor((storedProgress.watchedSeconds!/(currentEpisode.runtime*60))*100))}%` }}
                    />
                  </div>
                  <span className="hero-progress-text">
                    {Math.floor(storedProgress.watchedSeconds!/60)} of {currentEpisode.runtime}m
                  </span>
                </div>
              )}

              <div className="hero-actions">
                <button
                  className="netflix-play-btn"
                  onClick={() => play()}
                >
                  <span className="play-icon">▶</span>
                  {storedProgress && storedProgress.season && storedProgress.episode
                    ? "Resume"
                    : "Play"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Content Container */}
        <div className="netflix-content-container">
          {/* Show Information Section (Netflix intermediate section) */}
          {details && (
            <div className="show-info-section">
              <div className="show-details">
                <div className="show-year-seasons">
                  <span className="show-year">{item.year || "2017"}</span>
                  <span className="show-seasons">{details.seasons.filter(s => s.season_number !== 0).length} Season{details.seasons.filter(s => s.season_number !== 0).length > 1 ? 's' : ''}</span>
                </div>
                {typeof item.vote_average === 'number' && (
                  <div className="show-rating-tags">
                    <span className="show-rating">{item.vote_average.toFixed(1)}</span>
                  </div>
                )}
                
                {/* Current Episode Details */}
                {currentEpisode && (
                  <div className="current-episode-details">
                    <h3 className="current-episode-title">
                      S{currentEpisode.season_number}:E{currentEpisode.episode_number} "{currentEpisode.name}"
                    </h3>
                    <p className="current-episode-description">
                      {truncateDescription(currentEpisode.overview, 25)}
                    </p>
                  </div>
                )}
              </div>

              {/* Cast and Meta Info */}
              <div className="show-meta-sidebar">
                <div className="meta-row">
                  <span className="meta-label">Cast:</span>
                  <span className="meta-value">
                    {(details.cast || []).slice(0, 5).join(", ")}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Genres:</span>
                  <span className="meta-value">
                    {(details.genres || []).join(", ")}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">This Show Is:</span>
                  <span className="meta-value">—</span>
                </div>
              </div>
            </div>
          )}

          {/* Episodes Section (Full Width) */}
          <div className="episodes-section-full">
            <div className="episodes-header">
              <h3>Episodes</h3>
              <div className="season-dropdown">
                <select
                  value={currentSeason || undefined}
                  onChange={(e) => {
                    setCurrentSeason(parseInt(e.target.value, 10));
                    setSelectedEpisode(null);
                    setTorrentOptions([]);
                  }}
                >
                  {details?.seasons
                    .filter((s) => s.season_number !== 0)
                    .slice()
                    .sort((a, b) => a.season_number - b.season_number)
                    .map((s) => (
                      <option key={s.season_number} value={s.season_number}>
                        Season {s.season_number}
                      </option>
                    ))}
                </select>
                <span className="dropdown-arrow">▼</span>
              </div>
            </div>

            {/* Season Info */}
            {details && currentSeason && (
              <div className="season-info">
                <span className="season-meta">Season {currentSeason}</span>
              </div>
            )}

            {/* Episode List */}
            {loadingEpisodes ? (
              <p className="loading-text">Loading episodes…</p>
            ) : (
              <div className="netflix-episodes-list">
                {episodes.map((ep, index) => (
                  <div key={ep.id} className="netflix-episode-item">
                    <div className="episode-number">{index + 1}</div>
                    <div className="episode-thumbnail-container">
                      {ep.still_path ? (
                        <img
                          className="episode-thumbnail"
                          src={`https://image.tmdb.org/t/p/w300${ep.still_path}`}
                          alt={ep.name}
                        />
                      ) : (
                        <div className="episode-thumbnail placeholder" />
                      )}
                      {/* Progress bar overlay */}
                      <div className="episode-progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${(()=>{
                            const prog = getProgress(item.id, "tv");
                            if(prog && prog.season===ep.season_number && prog.episode===ep.episode_number && ep.runtime){
                              return Math.min(100, Math.floor(( (prog.watchedSeconds||0)/(ep.runtime*60))*100));
                            }
                            return 0;})()}%` }}
                        />
                      </div>
                      <div className="episode-play-overlay">
                        <button 
                          className="episode-play-btn"
                          onClick={() => playEpisode(ep)}
                          disabled={loadingEpisodeId === ep.id || unavailableEpisodes.includes(ep.id)}
                        >
                          {loadingEpisodeId === ep.id ? (
                            <div className="loading-spinner-sm" />
                          ) : unavailableEpisodes.includes(ep.id) ? (
                            '⛔'
                          ) : (
                            '▶'
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="episode-details">
                      <div className="episode-header">
                        <h4 className="episode-name">{ep.name}</h4>
                        <span className="episode-duration">{ep.runtime || (details?.episode_run_time?.[0] ?? "")}m</span>
                      </div>
                      <p className="episode-overview">{truncateDescription(ep.overview, 25)}</p>
                      {/* Torrent options UI removed – only play button overlay remains */}
                    </div>
                    {unavailableEpisodes.includes(ep.id) && (
                      <p className="episode-unavailable" style={{ color: '#e50914', margin: '4px 0' }}>
                        No streams found
                      </p>
                    )}
                    {/* Removed episode select toggle */}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      
      {playerSrc && playingEpisode && (
        <FullscreenPlayer
          src={playerSrc}
          title={`${item.title} - S${playingEpisode.season_number}:E${playingEpisode.episode_number}`}
          subtitle={playingEpisode.name}
          runtime={playingEpisode.runtime || (details?.episode_run_time?.[0])}
          torrentOptions={playingOptions}
          onClose={() => {
            setPlayerSrc(null);
            setPlayingEpisode(null);
          }}
          onTimeUpdate={(currentTime) => {
            if (!playingEpisode) return;
            updateProgress({
              id: item.id,
              media_type: "tv",
              title: item.title,
              poster_path: item.poster_path,
              season: playingEpisode.season_number,
              episode: playingEpisode.episode_number,
              watchedSeconds: Math.floor(currentTime),
            });
          }}
          onEnded={() => {
            if (!playingEpisode) return;
            updateProgress({
              id: item.id,
              media_type: "tv",
              title: item.title,
              poster_path: item.poster_path,
              season: playingEpisode.season_number,
              episode: playingEpisode.episode_number,
              finished: true,
              watchedSeconds: playingEpisode.runtime ? playingEpisode.runtime * 60 : undefined,
            });
            setPlayerSrc(null);
            setPlayingEpisode(null);
          }}
          initialTime={(() => {
            const prog = getProgress(item.id, "tv");
            if (prog && prog.season === playingEpisode.season_number && prog.episode === playingEpisode.episode_number) {
              return prog.watchedSeconds || 0;
            }
            return 0;
          })()}
        />
      )}
      
      {/* End of modal content */}
      </div>
    </div>
  );
} 