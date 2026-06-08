import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { PALETTES, DEFAULT_PALETTE_ID, getPalette, type Palette } from '@/constants/theme';

// Active color palette, persisted so the choice survives restarts. setPalette
// updates instantly; any screen using useColors() restyles on the next render.
const KEY = 'mp_palette';

interface ThemeState {
  paletteId: string;
  colors: Palette;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPalette: (id: string) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  paletteId: DEFAULT_PALETTE_ID,
  colors: getPalette(DEFAULT_PALETTE_ID),
  hydrated: false,
  hydrate: async () => {
    try {
      const id = await SecureStore.getItemAsync(KEY);
      if (id) set({ paletteId: id, colors: getPalette(id) });
    } catch { /* first run — keep default */ }
    set({ hydrated: true });
  },
  setPalette: (id) => {
    if (!PALETTES.some((p) => p.id === id)) return;
    set({ paletteId: id, colors: getPalette(id) });
    SecureStore.setItemAsync(KEY, id).catch(() => {});
  },
}));

// Convenience selector — the active palette.
export const useColors = (): Palette => useThemeStore((s) => s.colors);
