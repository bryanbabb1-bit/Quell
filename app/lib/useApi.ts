import { useAuth } from '@clerk/clerk-expo';
import { useCallback, useMemo, useRef } from 'react';
import { apiJson } from '@/lib/api';
import type {
  DiscoveryMatch, Match, Message, HoleEntry, RevealResponse, SubmitScoresResponse, HolesSetup,
  MyRecord, LeaderboardEntry, CourseSummary, TeeSummary,
} from '@/types';

export interface CreateMatchInput {
  course_name: string;
  tee_color: string;
  tee_id?: string | null;
  play_date: string;
  play_time?: string | null;
  match_type: string;
  stakes?: number | null;
  hcp_range_min: number;
  hcp_range_max: number;
}

// Binds the API client to the current Clerk session: every call mints a fresh
// token, so screens never thread getToken/Authorization themselves. apiFetch
// still transparently retries once on a 401 (expired JWT).
export function useApi() {
  const { getToken } = useAuth();

  // Clerk recreates getToken every render; depending on it directly would make
  // `call` (and the memoized api object) change every render, which cascades
  // into useFocusEffect/useEffect reload loops on any screen that depends on
  // `api`. Read it through a ref so `call` is stable. See feedback_gettoken_not_dep.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const call = useCallback(
    async <T>(path: string, options?: RequestInit): Promise<T> => {
      const token = await getTokenRef.current();
      if (!token) throw new Error('Not signed in');
      return apiJson<T>(path, token, options);
    },
    []
  );

  return useMemo(
    () => ({
      // Course catalog
      getCourses: () => call<{ courses: CourseSummary[] }>('/courses'),
      getCourse: (id: string) => call<{ course: CourseSummary; tees: TeeSummary[] }>(`/courses/${id}`),

      // Profile
      getMe: () => call<any>('/me'),
      updateMe: (patch: Record<string, unknown>) =>
        call<any>('/me', { method: 'PATCH', body: JSON.stringify(patch) }),

      // Records / leaderboard
      getMyRecord: () => call<MyRecord>('/me/record'),
      getLeaderboard: (course?: string) =>
        call<{ entries: LeaderboardEntry[] }>(`/leaderboard${course ? `?course=${encodeURIComponent(course)}` : ''}`),

      // Matches
      discover: (filters?: { match_type?: string; course?: string; all?: boolean }) => {
        const q = new URLSearchParams();
        if (filters?.match_type && filters.match_type !== 'any') q.set('match_type', filters.match_type);
        if (filters?.course?.trim()) q.set('course', filters.course.trim());
        if (filters?.all) q.set('all', '1');
        const qs = q.toString();
        return call<{ matches: DiscoveryMatch[] }>(`/matches${qs ? `?${qs}` : ''}`);
      },
      myMatches: () => call<{ matches: Match[] }>('/matches/mine'),
      getMatch: (id: string) => call<Match>(`/matches/${id}`),
      createMatch: (input: CreateMatchInput) =>
        call<Match>('/matches', { method: 'POST', body: JSON.stringify(input) }),
      acceptMatch: (id: string) =>
        call<Match>(`/matches/${id}/accept`, { method: 'POST' }),
      cancelMatch: (id: string) =>
        call<Match>(`/matches/${id}/cancel`, { method: 'POST' }),
      declineMatch: (id: string) =>
        call<Match>(`/matches/${id}/decline`, { method: 'POST' }),

      // Scorecards
      getMatchHoles: (matchId: string) =>
        call<HolesSetup>(`/matches/${matchId}/holes`),
      submitScorecard: (matchId: string, holeScores: HoleEntry[]) =>
        call<SubmitScoresResponse>(`/matches/${matchId}/scorecard`, {
          method: 'POST',
          body: JSON.stringify({ hole_scores: holeScores }),
        }),
      getReveal: (matchId: string) =>
        call<RevealResponse>(`/matches/${matchId}/reveal`),

      // Messages
      messages: (matchId: string) =>
        call<{ messages: Message[] }>(`/matches/${matchId}/messages`),
      sendMessage: (matchId: string, body: string) =>
        call<Message>(`/matches/${matchId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ body }),
        }),
    }),
    [call]
  );
}
