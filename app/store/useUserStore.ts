import { create } from 'zustand';
import { apiJson } from '@/lib/api';

export interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  ghin_number: string | null;
  handicap: number | null;
  profile_photo_url: string | null;
  created_at: string;
  updated_at: string;
}

interface UserState {
  user: User | null;
  loading: boolean;
  loadFailed: boolean;
  load: (token: string) => Promise<void>;
  update: (token: string, patch: Partial<Pick<User, 'first_name' | 'last_name' | 'handicap' | 'profile_photo_url'>>) => Promise<void>;
  reset: () => void;
}

// Mirrors TrueForecast's user store: /me upserts the row server-side on first
// authenticated call, so `load` doubles as "ensure a backing user exists".
export const useUserStore = create<UserState>((set) => ({
  user: null,
  loading: false,
  loadFailed: false,
  load: async (token) => {
    set({ loading: true, loadFailed: false });
    try {
      const user = await apiJson<User>('/me', token);
      set({ user, loading: false });
    } catch {
      set({ loading: false, loadFailed: true });
    }
  },
  update: async (token, patch) => {
    const user = await apiJson<User>('/me', token, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    set({ user });
  },
  reset: () => set({ user: null, loading: false, loadFailed: false }),
}));
