import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

// Client-side "archive" for My Matches — hides finished matches from the list
// without touching the server. The player's RECORD is derived separately on the
// backend from all matches, so archiving here never affects W/L/H or the
// leaderboard. Persisted per-device in secure-store.
const KEY = 'mp_archived_matches';

interface ArchiveState {
  archived: string[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggle: (id: string) => void;
}

export const useArchiveStore = create<ArchiveState>((set, get) => ({
  archived: [],
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw) set({ archived: JSON.parse(raw) });
    } catch { /* first run — empty */ }
    set({ hydrated: true });
  },
  toggle: (id) => {
    const cur = get().archived;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    set({ archived: next });
    SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => {});
  },
}));
