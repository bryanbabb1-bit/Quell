import { useAuth } from '@clerk/clerk-expo';
import { useCallback, useMemo } from 'react';
import { apiJson } from '@/lib/api';
import type {
  DiscoveryMatch, Match, Message, HoleEntry, RevealResponse, SubmitScoresResponse,
} from '@/types';

export interface CreateMatchInput {
  course_name: string;
  tee_color: string;
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

  const call = useCallback(
    async <T>(path: string, options?: RequestInit): Promise<T> => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      return apiJson<T>(path, token, options);
    },
    [getToken]
  );

  return useMemo(
    () => ({
      // Profile
      getMe: () => call<any>('/me'),
      updateMe: (patch: Record<string, unknown>) =>
        call<any>('/me', { method: 'PATCH', body: JSON.stringify(patch) }),

      // Matches
      discover: () => call<{ matches: DiscoveryMatch[] }>('/matches'),
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
