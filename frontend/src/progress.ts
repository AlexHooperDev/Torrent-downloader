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

export function getProgress(id: number, media_type: "tv" | "movie"): ProgressEntry | undefined {
  return loadProgress().find((e) => e.id === id && e.media_type === media_type);
}

export function updateProgress(entry: ProgressEntry) {
  const entries = loadProgress();
  const idx = entries.findIndex((e) => e.id === entry.id && e.media_type === entry.media_type);
  if (idx !== -1) {
    entries[idx] = { ...entries[idx], ...entry };
  } else {
    entries.push(entry);
  }
  saveProgress(entries);
} 