import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

// Client-side "saved/starred" open matches — lets a player bookmark a match in
// Discovery to come back to it later, instead of accepting or passing now.
// Persisted per-device in secure-store; the "Saved only" Discovery filter reads
// this. No backend needed (open matches a player saved are re-fetched live).
const KEY = 'mp_saved_matches';

interface SavedState {
  saved: string[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  isSaved: (id: string) => boolean;
  toggle: (id: string) => void;
}

export const useSavedMatchesStore = create<SavedState>((set, get) => ({
  saved: [],
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw) set({ saved: JSON.parse(raw) });
    } catch { /* first run — empty */ }
    set({ hydrated: true });
  },
  isSaved: (id) => get().saved.includes(id),
  toggle: (id) => {
    const cur = get().saved;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    set({ saved: next });
    SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => {});
  },
}));
