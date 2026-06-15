import { useAuth } from '@clerk/clerk-expo';
import { useCallback, useMemo, useRef } from 'react';
import { apiJson } from '@/lib/api';
import type {
  DiscoveryMatch, Match, Message, HoleEntry, RevealResponse, SubmitScoresResponse, HolesSetup,
  MyRecord, LeaderboardEntry, CourseSummary, TeeSummary, Favorite, PlayerProfile, Gif,
  CourseFeedMatch, Visibility, OpenInvite, CoursePulse, ClubSummary, ClubDetail,
  ClubChampions, ClubDashboard, ClubMemberDetail, ClubIntros, LiveState, CheerKind,
  CheerResult, Reactors,
} from '@/types';

export interface CreateMatchInput {
  course_name: string;
  tee_color: string;
  tee_id?: string | null;
  play_date: string;
  play_time?: string | null;
  match_type: string;
  visibility?: Visibility; // 'private' (default) | 'public'
  stakes?: number | null;
  hcp_range_min: number;
  hcp_range_max: number;
  opponent_id?: string | null; // present → a direct challenge (status 'pending')
  playing_together?: boolean;  // same group (gates live scoring) vs apart
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
      // Players
      getPlayer: (id: string) => call<PlayerProfile>(`/players/${id}`),

      // Profile photo upload (raw image bytes -> R2 -> profile_photo_url)
      uploadPhoto: async (localUri: string): Promise<{ url: string }> => {
        const token = await getTokenRef.current();
        if (!token) throw new Error('Not signed in');
        const fileResp = await fetch(localUri);
        const blob = await fileResp.blob();
        const up = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/photo`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': blob.type || 'image/jpeg' },
          body: blob,
        });
        if (!up.ok) throw new Error((await up.json().catch(() => ({}))).error ?? 'Upload failed');
        return up.json();
      },

      // Favorites (common opponents)
      getFavorites: () => call<{ favorites: Favorite[] }>('/favorites'),
      addFavorite: (userId: string) => call<{ favorited: boolean }>(`/favorites/${userId}`, { method: 'POST' }),
      removeFavorite: (userId: string) => call<{ favorited: boolean }>(`/favorites/${userId}`, { method: 'DELETE' }),

      // Course catalog
      getCourses: () => call<{ courses: CourseSummary[] }>('/courses'),
      getCourse: (id: string) => call<{ course: CourseSummary; tees: TeeSummary[] }>(`/courses/${id}`),

      // Clubs (the network layer)
      getClub: (id: string) => call<ClubDetail>(`/clubs/${id}`),
      clubInterest: (id: string) =>
        call<{ recorded: boolean; count: number }>(`/clubs/${id}/interest`, { method: 'POST' }),
      // Live spectating + scoring
      followMatch: (id: string) =>
        call<{ following: boolean; count: number }>(`/matches/${id}/follow`, { method: 'POST' }),
      unfollowMatch: (id: string) =>
        call<{ following: boolean; count: number }>(`/matches/${id}/follow`, { method: 'DELETE' }),
      getLive: (id: string) => call<LiveState>(`/matches/${id}/live`),
      // Either participant may post EITHER side (one card-keeper).
      postLiveHole: (id: string, hole: number, scores: { creator_gross?: number; opponent_gross?: number }) =>
        call<LiveState>(`/matches/${id}/live-score`, { method: 'POST', body: JSON.stringify({ hole, ...scores }) }),
      confirmCard: (id: string) =>
        call<LiveState>(`/matches/${id}/confirm`, { method: 'POST' }),
      sendCheer: (id: string, kind: CheerKind) =>
        call<CheerResult>(`/matches/${id}/cheer`, { method: 'POST', body: JSON.stringify({ kind }) }),
      getReactors: (id: string) => call<{ reactors: Reactors }>(`/matches/${id}/reactors`),

      getChampions: (id: string, month?: string) =>
        call<ClubChampions>(`/clubs/${id}/champions${month ? `?month=${month}` : ''}`),
      getClubDashboard: (id: string) => call<ClubDashboard>(`/clubs/${id}/dashboard`),
      getClubMember: (id: string, userId: string) => call<ClubMemberDetail>(`/clubs/${id}/member/${userId}`),
      getClubIntros: (id: string) => call<ClubIntros>(`/clubs/${id}/intros`),
      updateClub: (id: string, patch: { primary_color?: string | null; pinned_message?: string | null }) =>
        call<ClubDetail>(`/clubs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
      // Crest upload — staff only; mirrors uploadPhoto but targets the club.
      uploadClubCrest: async (id: string, localUri: string): Promise<{ crest_url: string }> => {
        const token = await getTokenRef.current();
        if (!token) throw new Error('Not signed in');
        const fileResp = await fetch(localUri);
        const blob = await fileResp.blob();
        const up = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/clubs/${id}/crest`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': blob.type || 'image/jpeg' },
          body: blob,
        });
        if (!up.ok) throw new Error((await up.json().catch(() => ({}))).error ?? 'Upload failed');
        return up.json();
      },

      // Profile
      getMe: () => call<any>('/me'),
      updateMe: (patch: Record<string, unknown>) =>
        call<any>('/me', { method: 'PATCH', body: JSON.stringify(patch) }),
      deleteMe: () => call<{ deleted: boolean }>('/me', { method: 'DELETE' }),

      // Blocking + reporting (safety)
      getBlocks: () => call<{ blocked: string[] }>('/blocks'),
      blockUser: (userId: string) => call<{ blocked: boolean }>(`/blocks/${userId}`, { method: 'POST' }),
      unblockUser: (userId: string) => call<{ blocked: boolean }>(`/blocks/${userId}`, { method: 'DELETE' }),
      reportUser: (input: { reported_id: string; match_id?: string | null; reason: 'spam' | 'abuse' | 'cheating' | 'other'; detail?: string | null }) =>
        call<{ reported: boolean }>('/reports', { method: 'POST', body: JSON.stringify(input) }),

      // Records / leaderboard
      getMyRecord: () => call<MyRecord>('/me/record'),
      getLeaderboard: (course?: string) =>
        call<{ entries: LeaderboardEntry[] }>(`/leaderboard${course ? `?course=${encodeURIComponent(course)}` : ''}`),

      // Matches
      discover: (filters?: { match_type?: string; course?: string; all?: boolean; from?: string; days?: string[] }) => {
        const q = new URLSearchParams();
        if (filters?.match_type && filters.match_type !== 'any') q.set('match_type', filters.match_type);
        if (filters?.course?.trim()) q.set('course', filters.course.trim());
        if (filters?.all) q.set('all', '1');
        if (filters?.from) q.set('from', filters.from);
        if (filters?.days?.length) q.set('days', filters.days.join(','));
        const qs = q.toString();
        return call<{ matches: DiscoveryMatch[] }>(`/matches${qs ? `?${qs}` : ''}`);
      },
      myMatches: () => call<{ matches: Match[] }>('/matches/mine'),
      getMatch: (id: string) => call<Match>(`/matches/${id}`),
      createMatch: (input: CreateMatchInput) =>
        call<Match>('/matches', { method: 'POST', body: JSON.stringify(input) }),
      acceptMatch: (id: string) =>
        call<Match>(`/matches/${id}/accept`, { method: 'POST' }),
      getMatchTees: (id: string) =>
        call<{ tees: TeeSummary[] }>(`/matches/${id}/tees`),
      setMatchTee: (id: string, tee_id: string) =>
        call<Match>(`/matches/${id}/tee`, { method: 'POST', body: JSON.stringify({ tee_id }) }),
      cancelMatch: (id: string) =>
        call<Match>(`/matches/${id}/cancel`, { method: 'POST' }),
      declineMatch: (id: string) =>
        call<Match>(`/matches/${id}/decline`, { method: 'POST' }),
      nudgeMatch: (id: string) =>
        call<{ ok: boolean; reason?: string }>(`/matches/${id}/nudge`, { method: 'POST' }),
      setVisibility: (id: string, visibility: Visibility) =>
        call<Match>(`/matches/${id}/visibility`, { method: 'POST', body: JSON.stringify({ visibility }) }),

      // Course feed — the club board: the day's public activity, upcoming open
      // invites, and the club pulse. `today` is the device's local date so
      // invites anchor to the player's clock, not the Worker's UTC.
      courseFeed: (course: string, date?: string, today?: string) => {
        const q = new URLSearchParams({ course });
        if (date) q.set('date', date);
        if (today) q.set('today', today);
        return call<{ matches: CourseFeedMatch[]; open?: OpenInvite[]; pulse?: CoursePulse; club?: ClubSummary | null }>(`/matches/feed?${q.toString()}`);
      },

      // Scorecards
      startScoring: (matchId: string) =>
        call<{ ok: boolean }>(`/matches/${matchId}/scoring-started`, { method: 'POST' }),
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
      sendGif: (matchId: string, gif_url: string) =>
        call<Message>(`/matches/${matchId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ gif_url }),
        }),
      searchGifs: (q: string) =>
        call<{ gifs: Gif[]; unconfigured?: boolean }>(`/gifs${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`),
    }),
    [call]
  );
}
