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
