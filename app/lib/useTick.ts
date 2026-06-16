import { useEffect, useState } from 'react';

// One shared 1Hz ticker for every live countdown on screen, so a list full of
// forfeit clocks costs a single interval instead of one per component. The
// interval only runs while something is subscribed.
let interval: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function ensureRunning() {
  if (interval) return;
  interval = setInterval(() => { listeners.forEach((l) => l()); }, 1000);
}

// Subscribe to the shared ticker — re-renders the caller once per second.
export function useTick(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => (n + 1) % 1_000_000);
    listeners.add(l);
    ensureRunning();
    return () => {
      listeners.delete(l);
      if (listeners.size === 0 && interval) { clearInterval(interval); interval = null; }
    };
  }, []);
}
