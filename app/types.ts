// Shared client-side types mirroring the API's D1 rows.

export type MatchStatus =
  | 'open' | 'accepted' | 'in_progress' | 'completed' | 'declined' | 'cancelled';

export type MatchType = 'front_nine' | 'back_nine' | 'eighteen';

export interface Match {
  id: string;
  creator_id: string;
  opponent_id: string | null;
  status: MatchStatus;
  course_name: string;
  tee_color: string;
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
}

// Discovery rows join the creator's name + index onto the match.
export interface DiscoveryMatch extends Match {
  creator_first_name: string | null;
  creator_last_name: string | null;
  creator_handicap_index: number | null;
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
  progression: MatchProgression | null;
}

export interface SubmitScoresResponse {
  status: 'waiting_on_opponent' | 'completed';
  match?: Match;
}

// Holes a match type is played over (mirrors api/src/routes/scorecards.ts).
export function holeRangeFor(matchType: MatchType): { min: number; max: number; count: number } {
  if (matchType === 'front_nine') return { min: 1, max: 9, count: 9 };
  if (matchType === 'back_nine') return { min: 10, max: 18, count: 9 };
  return { min: 1, max: 18, count: 18 };
}
