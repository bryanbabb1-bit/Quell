import { useCallback } from 'react';
import { create } from 'zustand';
import { useApi } from '@/lib/useApi';
import type { Favorite } from '@/types';

// Reactive favorites ("common opponents") shared across screens so a star
// toggled on one screen updates everywhere.
interface FavState {
  ids: string[];
  list: Favorite[];
  loaded: boolean;
  setList: (favs: Favorite[]) => void;
  setFavorited: (userId: string, fav: boolean, info?: { name: string; handicap: number | null }) => void;
}

export const useFavoritesStore = create<FavState>((set) => ({
  ids: [],
  list: [],
  loaded: false,
  setList: (favs) => set({ list: favs, ids: favs.map((f) => f.user_id), loaded: true }),
  setFavorited: (userId, fav, info) => set((s) => {
    if (fav) {
      const ids = s.ids.includes(userId) ? s.ids : [...s.ids, userId];
      const list = s.list.some((f) => f.user_id === userId)
        ? s.list
        : [...s.list, { user_id: userId, name: info?.name ?? 'A golfer', handicap: info?.handicap ?? null, photo_url: null }];
      return { ids, list };
    }
    return { ids: s.ids.filter((x) => x !== userId), list: s.list.filter((f) => f.user_id !== userId) };
  }),
}));

// Hook: load the favorites + an optimistic toggle.
export function useFavorites() {
  const api = useApi();
  const ids = useFavoritesStore((s) => s.ids);
  const list = useFavoritesStore((s) => s.list);
  const loaded = useFavoritesStore((s) => s.loaded);
  const setList = useFavoritesStore((s) => s.setList);
  const setFavorited = useFavoritesStore((s) => s.setFavorited);

  const load = useCallback(async () => {
    try { const r = await api.getFavorites(); setList(r.favorites); } catch { /* keep last */ }
  }, [api, setList]);

  const isFavorite = useCallback((userId: string) => ids.includes(userId), [ids]);

  const toggle = useCallback(async (userId: string, info?: { name: string; handicap: number | null }) => {
    const was = ids.includes(userId);
    setFavorited(userId, !was, info); // optimistic
    try {
      if (was) await api.removeFavorite(userId);
      else await api.addFavorite(userId);
    } catch {
      setFavorited(userId, was, info); // revert on failure
    }
  }, [api, ids, setFavorited]);

  return { ids, list, loaded, load, isFavorite, toggle };
}
