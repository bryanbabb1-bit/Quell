import { useCallback } from 'react';
import { create } from 'zustand';
import { useApi } from '@/lib/useApi';
import type { CourseSummary } from '@/types';

// One shared fetch of the course catalog. CourseSelect/Feed/Record/Profile all
// need the list and used to each fire their own GET /courses on every mount —
// the catalog is stable data, so hydrate once and share it.
interface CourseState {
  courses: CourseSummary[] | null; // null = not loaded yet
  setCourses: (c: CourseSummary[]) => void;
}

export const useCourseStore = create<CourseState>((set) => ({
  courses: null,
  setCourses: (courses) => set({ courses }),
}));

let inflight: Promise<void> | null = null;

export function useCourses() {
  const api = useApi();
  const courses = useCourseStore((s) => s.courses);
  const setCourses = useCourseStore((s) => s.setCourses);

  const load = useCallback(async () => {
    if (useCourseStore.getState().courses) return;
    // Dedupe concurrent mounts (several screens hydrate at startup).
    if (!inflight) {
      inflight = api.getCourses()
        .then((r) => setCourses(r.courses))
        .catch(() => {})
        .finally(() => { inflight = null; });
    }
    await inflight;
  }, [api, setCourses]);

  return { courses, load };
}
