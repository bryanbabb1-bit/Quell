import * as SecureStore from 'expo-secure-store';

// Persists Clerk's session JWT in the device keychain so a session survives
// app restarts. Reads/writes are wrapped so a keychain hiccup degrades to a
// fresh sign-in rather than crashing the boot. (Structurally matches Clerk's
// TokenCache; left untyped to avoid depending on Clerk's internal type path.)
export const tokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      // A corrupt/undecryptable item would otherwise wedge auth — clear it.
      try { await SecureStore.deleteItemAsync(key); } catch {}
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {}
  },
};
