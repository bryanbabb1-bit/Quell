// Shared client-side types mirroring the API's D1 rows.

export type MatchStatus =
  | 'open' | 'pending' | 'accepted' | 'in_progress' | 'completed' | 'declined' | 'cancelled' | 'expired';

// A starred "common opponent".
export interface Favorite {
  user_id: string;
  name: string;
  handicap: number | null;
}

// Public player profile (GET /players/:id).
export interface PlayerProfile {
  user_id: string;
  name: string;
  handicap: number | null;
  photo_url: string | null;
  home_course: string | null;
  wins: number;
  losses: number;
  ties: number;
  played: number;
  win_pct: number;
  head_to_head: { wins: number; losses: number; ties: number };
  is_me: boolean;
}

export type MatchType = 'front_nine' | 'back_nine' | 'eighteen';

export interface Match {
  id: string;
  creator_id: string;
  opponent_id: string | null;
  status: MatchStatus;
  course_name: string;
  tee_color: string;        // the CREATOR's tee
  tee_id?: string | null;
  opponent_tee_color?: string | null; // the OPPONENT's tee (may differ)
  opponent_tee_id?: string | null;
  play_date: string;        // YYYY-MM-DD
  play_time: string | null; // HH:MM
  match_type: MatchType;
  stakes: number | null;    // display only
  hcp_range_min: number;
  hcp_range_max: number;
  creator_scorecard_id: string | null;
  opponent_scorecard_id: string | null;
  creator_handicap: number | null;
  opponent_handicap: number | null;
  result: 'creator_wins' | 'opponent_wins' | 'tie' | null;
  match_progression: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  // Present on the get-one (match detail) response; derived server-side.
  creator_name?: string;
  opponent_name?: string | null;
}

// Discovery rows join the creator's name + index onto the match.
export interface DiscoveryMatch extends Match {
  creator_first_name: string | null;
  creator_last_name: string | null;
  creator_handicap_index: number | null;
  creator_photo_url: string | null;
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  read: number;
  created_at: string;
}

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  front_nine: 'Front 9',
  back_nine: 'Back 9',
  eighteen: '18 Holes',
};

// ── Scorecards + reveal ─────────────────────────────────────────────────────
// These mirror the API's scoring engine (api/src/lib/scoring.ts). Keep in sync.

export interface HoleEntry {
  hole: number;
  gross: number;
}

export interface Scorecard {
  id: string;
  match_id: string;
  player_id: string;
  hole_scores: string; // JSON-encoded HoleEntry[]
  total_gross: number;
  submitted_at: string;
}

export interface HoleResult {
  hole: number;
  creator_gross: number;
  creator_strokes: number;
  creator_net: number;
  opponent_gross: number;
  opponent_strokes: number;
  opponent_net: number;
  winner: 'creator' | 'opponent' | 'tie';
  creator_delta: number; // running holes-up, creator perspective
  cumulative: string;
}

export interface MatchProgression {
  holes: HoleResult[];
  final_result: 'creator_wins' | 'opponent_wins' | 'tie';
  final_delta: string; // "3 & 2", "2 Up", "All Square"
  decided_on_hole: number | null;
}

export interface RevealResponse {
  match: Match;
  creator_scorecard: Scorecard;
  opponent_scorecard: Scorecard;
  creator_name: string;
  opponent_name: string;
  creator_photo_url: string | null;
  opponent_photo_url: string | null;
  progression: MatchProgression | null;
}

export interface SubmitScoresResponse {
  status: 'waiting_on_opponent' | 'completed';
  match?: Match;
}

export interface HoleInfo {
  hole: number;
  par: number | null;
  stroke_index: number | null;
}

// GET /matches/:id/holes — par/stroke-index context + the strokes the caller
// receives in this match. No score data; safe before the reveal.
export interface HolesSetup {
  has_course_data: boolean;
  holes: HoleInfo[];
  par_total: number | null;
  my_strokes: number[];       // aligned positionally to `holes`
  creator_strokes: number[];  // strokes the creator receives, per hole
  opponent_strokes: number[]; // strokes the opponent receives, per hole
  creator_course_handicap: number | null;
  opponent_course_handicap: number | null;
}

// ── Records / leaderboard ───────────────────────────────────────────────────
export type Outcome = 'win' | 'loss' | 'tie';

export interface RecentResult {
  match_id: string;
  course_name: string;
  outcome: Outcome;
  final_delta: string | null;
  completed_at: string | null;
  opponent_name: string;
}

export interface MyRecord {
  played: number;
  wins: number;
  losses: number;
  ties: number;
  win_pct: number;
  current_streak: { type: Outcome | 'none'; count: number };
  recent: RecentResult[];
}

export interface LeaderboardEntry {
  user_id: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  played: number;
  win_pct: number;
  is_me: boolean;
}

// ── Course catalog ──────────────────────────────────────────────────────────
export interface CourseSummary {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

export interface TeeSummary {
  id: string;
  name: string;
  gender: string | null;
  course_rating: number | null;
  slope_rating: number | null;
  par: number | null;
}

// Holes a match type is played over (mirrors api/src/routes/scorecards.ts).
export function holeRangeFor(matchType: MatchType): { min: number; max: number; count: number } {
  if (matchType === 'front_nine') return { min: 1, max: 9, count: 9 };
  if (matchType === 'back_nine') return { min: 10, max: 18, count: 9 };
  return { min: 1, max: 18, count: 18 };
}
