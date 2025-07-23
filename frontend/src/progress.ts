export interface ProgressEntry {
  id: number;
  media_type: "tv" | "movie";
  title: string;
  poster_path: string;
  // For shows
  season?: number;
  episode?: number;
  // Mark when fully watched (e.g. movie finished or last episode watched)
  finished?: boolean;
  // Current playback position in seconds (for resume & progress bar)
  watchedSeconds?: number;
  // Runtime in seconds (for calculating remaining time)
  runtimeSeconds?: number;
}

const STORAGE_KEY = "watchProgress";

function loadProgress(): ProgressEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ProgressEntry[];
  } catch {
    return [];
  }
}

function saveProgress(entries: ProgressEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function getAllProgress(): ProgressEntry[] {
  return loadProgress();
}

export function getProgress(
  id: number,
  media_type: "tv" | "movie",
  season?: number,
  episode?: number
): ProgressEntry | undefined {
  const entries = loadProgress();

  // Helper to iterate from newest to oldest (end of array first)
  const iterateReverse = (cb: (e: ProgressEntry) => boolean) => {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (cb(entries[i])) return entries[i];
    }
    return undefined;
  };

  if (media_type === "tv") {
    if (season != null && episode != null) {
      // Exact episode lookup
      return entries.find(
        (e) =>
          e.id === id &&
          e.media_type === "tv" &&
          e.season === season &&
          e.episode === episode
      );
    }
    // No episode specified – return the most recently saved progress for this show
    return iterateReverse((e) => e.id === id && e.media_type === "tv");
  }

  // Movies: ignore season/episode
  return iterateReverse((e) => e.id === id && e.media_type === "movie");
}

export function updateProgress(entry: ProgressEntry) {
  const entries = loadProgress();
  let idx = -1;

  if (entry.media_type === "tv") {
    // For TV, differentiate by season & episode so each episode has its own record
    idx = entries.findIndex(
      (e) =>
        e.id === entry.id &&
        e.media_type === "tv" &&
        e.season === entry.season &&
        e.episode === entry.episode
    );
  } else {
    // Movies keep single record per id
    idx = entries.findIndex((e) => e.id === entry.id && e.media_type === "movie");
  }

  if (idx !== -1) {
    entries[idx] = { ...entries[idx], ...entry };
  } else {
    entries.push(entry);
  }

  saveProgress(entries);
} 