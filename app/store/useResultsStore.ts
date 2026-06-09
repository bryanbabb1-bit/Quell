import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

// Tracks which completed matches the user has already seen the result of, so the
// My Matches tab can badge NEW results and clear them as they're viewed. The
// seen set is persisted so the badge survives app restarts.
const KEY = 'mp_seen_results';

interface ResultsState {
  seen: string[];
  completedIds: string[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setCompleted: (ids: string[]) => void;
  markSeen: (id: string) => void;
}

export const useResultsStore = create<ResultsState>((set, get) => ({
  seen: [],
  completedIds: [],
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw) set({ seen: JSON.parse(raw) });
    } catch { /* first run / unreadable — start empty */ }
    set({ hydrated: true });
  },
  setCompleted: (ids) => set({ completedIds: ids }),
  markSeen: (id) => {
    const { seen } = get();
    if (seen.includes(id)) return;
    const next = [...seen, id].slice(-200); // cap growth (SecureStore size limits)
    set({ seen: next });
    SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => {});
  },
}));

// Count of completed matches whose result hasn't been viewed yet.
export const selectUnseenCount = (s: ResultsState): number =>
  s.completedIds.filter((id) => !s.seen.includes(id)).length;
