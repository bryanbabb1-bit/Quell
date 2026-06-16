// "What course am I at?" — asks for foreground location once, finds the nearest
// course via the GPS endpoint, and reports the one you're standing on.
//
// SAFE on an older build that lacks the expo-location native module: we PROBE for
// the native module first (mirroring lib/notifications.ts) and no-op when it's
// absent — no eager require, no dev-overlay error. When-in-use only; we never
// track location in the background.
import { useEffect, useRef, useState } from 'react';
import { useApi } from './useApi';
import type { NearbyCourse } from '@/types';

// Within this radius we treat you as AT the course (parking lot → first tee).
const AT_COURSE_KM = 1.5;

function locationAvailable(): boolean {
  try {
    const core = require('expo-modules-core');
    if (typeof core.requireOptionalNativeModule !== 'function') return false;
    return !!core.requireOptionalNativeModule('ExpoLocation');
  } catch {
    return false;
  }
}

export type NearbyStatus = 'idle' | 'unsupported' | 'denied' | 'unavailable' | 'ready';

export interface NearbyResult {
  atCourse: NearbyCourse | null; // nearest course within AT_COURSE_KM, else null
  nearby: NearbyCourse[];
  status: NearbyStatus;
}

// Runs at most once per mount (the ref guard also keeps a recreated `api` from
// re-triggering it — see the getToken loop lesson).
export function useNearbyCourse(enabled = true): NearbyResult {
  const api = useApi();
  const [result, setResult] = useState<NearbyResult>({ atCourse: null, nearby: [], status: 'idle' });
  const ran = useRef(false);

  useEffect(() => {
    if (!enabled || ran.current) return;
    ran.current = true;
    let cancelled = false;

    (async () => {
      if (!locationAvailable()) {
        if (!cancelled) setResult((r) => ({ ...r, status: 'unsupported' }));
        return;
      }
      try {
        const Location = require('expo-location');
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          if (!cancelled) setResult((r) => ({ ...r, status: 'denied' }));
          return;
        }
        // Race a timeout so a slow/no GPS fix never blocks the board waiting on us
        // (the screens gate the home-course default on this leaving 'idle').
        const pos: any = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
        ]);
        const { latitude, longitude } = pos.coords;
        const { courses } = await api.coursesNear(latitude, longitude);
        if (cancelled) return;
        const nearby = courses ?? [];
        const nearest = nearby[0] ?? null;
        const atCourse = nearest && nearest.distance_km <= AT_COURSE_KM ? nearest : null;
        setResult({ atCourse, nearby, status: 'ready' });
      } catch {
        if (!cancelled) setResult((r) => ({ ...r, status: 'unavailable' }));
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, api]);

  return result;
}
