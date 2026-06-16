// Shared client-side types mirroring the API's D1 rows.

export type MatchStatus =
  | 'open' | 'pending' | 'accepted' | 'in_progress' | 'completed' | 'declined' | 'cancelled' | 'expired';

// A starred "common opponent".
export interface Favorite {
  user_id: string;
  name: string;
  handicap: number | null;
  photo_url: string | null;
}

// One result in a rivalry series (viewer's perspective; newest first).
export interface SeriesResult {
  outcome: 'win' | 'loss' | 'tie';
  final_delta: string | null;
  course_name: string;
  completed_at: string | null;
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
  series: SeriesResult[];      // your last results vs them (≤5, newest first)
  last_match: SeriesResult | null;
  is_me: boolean;
}

export type MatchType = 'front_nine' | 'back_nine' | 'eighteen';

export type Visibility = 'private' | 'public';

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
  visibility?: Visibility;  // 'private' (default) | 'public' (in the course feed)
  stakes: number | null;    // display only
  hcp_range_min: number;
  hcp_range_max: number;
  playing_together?: number; // 0/1 — same group (gates live scoring) vs apart
  creator_scorecard_id: string | null;
  opponent_scorecard_id: string | null;
  creator_handicap: number | null;
  opponent_handicap: number | null;
  result: 'creator_wins' | 'opponent_wins' | 'tie' | null;
  match_progression: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  // Stamped when each player OPENS score entry (pre-Settle tension display).
  creator_scoring_at?: string | null;
  opponent_scoring_at?: string | null;
  // Present on the get-one (match detail) response; derived server-side.
  creator_name?: string;
  opponent_name?: string | null;
  creator_photo_url?: string | null;
  opponent_photo_url?: string | null;
  // Present on My Matches (listMine) rows — viewer-perspective result, so the
  // list can show "Won 3 & 2" (gated behind the seen-reveal check, no spoiler).
  outcome?: 'win' | 'loss' | 'tie' | null;
  final_delta?: string | null;
  is_forfeit?: boolean;
}

// Discovery rows join the creator's name + index onto the match.
export interface DiscoveryMatch extends Match {
  creator_first_name: string | null;
  creator_last_name: string | null;
  creator_handicap_index: number | null;
  creator_photo_url: string | null;
}

// A row in a course feed (GET /matches/feed). Public matches at a course on a
// given day — live (accepted/in_progress) and completed.
export interface CourseFeedMatch {
  id: string;
  course_name: string;
  play_date: string;
  play_time: string | null;
  match_type: MatchType;
  status: MatchStatus;
  result: 'creator_wins' | 'opponent_wins' | 'tie' | null;
  final_delta: string | null; // "3 & 2" — completed only
  creator_id: string;
  opponent_id: string | null;
  creator_name: string;
  opponent_name: string;
  creator_photo_url: string | null;
  opponent_photo_url: string | null;
  creator_handicap_index?: number | null;  // index snapshot, shown face-up on the card
  opponent_handicap_index?: number | null;
  playing_together?: number; // 0/1 — same group (live-scorable) vs apart
  follower_count?: number;   // 👁 spectators on a live match
  is_following?: boolean;    // does the caller follow this match
  cheer_count?: number;      // 🔥 kudos on this match
  viewer_cheered?: boolean;  // has the caller cheered it
  is_mine: boolean;
}

// An open invite on the course board (GET /matches/feed `open`) — a player at
// this course looking for a game, today onward.
export interface OpenInvite {
  id: string;
  play_date: string;
  play_time: string | null;
  match_type: MatchType;
  stakes: number | null;
  hcp_range_min: number;
  hcp_range_max: number;
  creator_id: string;
  creator_name: string;
  creator_photo_url: string | null;
  creator_handicap_index: number | null;
  playing_together?: number; // 0/1 — same group vs separate rounds
  is_mine: boolean;
}

// Aggregate club activity (GET /matches/feed `pulse`) — anonymous counts.
export interface CoursePulse {
  week_matches: number;
  week_players: number;
  live_now: number;
  open_count: number;
}

// The club behind a course (GET /matches/feed `club`). 'network' = a paying
// Foretera club (gold badge, branded board); 'prospect' = unclaimed.
export interface ClubSummary {
  id: string;
  name: string;
  status: 'network' | 'prospect';
  crest_url: string | null;
  primary_color: string | null;
  // A note the club's staff pin to the board (e.g. "Men's league Saturday").
  pinned_message?: string | null;
  // An external link staff publish (website, tee-time booking, league signup).
  link_url?: string | null;
  // Member demand signals for this club (prospects) — social proof shown on
  // the prospect card before the viewer has tapped anything.
  interest_count?: number;
}

// GET /clubs/:id — the claim screen's view: the club + how many members have
// asked for it (the demand counter, shown back as social proof).
export interface ClubDetail extends ClubSummary {
  interest_count: number;
  pinned_message?: string | null;
}

// ── Club value tier (network clubs) ─────────────────────────────────────────
export type ChampionCategory = 'won' | 'played' | 'win_pct';

// One member's standing in a champion category (winner first, then runners-up).
export interface ChampionEntry {
  user_id: string;
  name: string;
  photo_url: string | null;
  value: number;   // wins | matches | win-pct (0..100)
  detail: string;  // '9 wins' | '14 matches' | '82% (11–2)'
  wins: number;
  losses: number;
  ties: number;
  played: number;
}

// GET /clubs/:id/champions — three monthly crowns. `crowned` false = live
// leaders for the in-progress month; true = frozen at month end.
export interface ClubChampions {
  club_id: string;
  month: string;       // 'YYYY-MM'
  crowned: boolean;
  won: ChampionEntry[];
  played: ChampionEntry[];
  win_pct: ChampionEntry[];
}

export interface DashboardPlayer {
  user_id: string;
  name: string;
  photo_url: string | null;
}

// GET /clubs/:id/dashboard — staff-only engagement view.
export interface ClubDashboard {
  course_name: string;
  this_week: { matches: number; players: number };
  last_week: { matches: number; players: number };
  trend: { week: string; matches: number }[];
  month_matches: number;
  active_this_month: number;
  new_this_month: number;
  returning_this_month: number;
  most_active: (DashboardPlayer & { matches: number })[];
  churn: { count: number; players: (DashboardPlayer & { last_played: string })[] };
  live_now: number;
  open_invites: number;
  demand: { total: number; last_30d: number };
}

// GET /clubs/:id/member/:uid — staff-only member engagement detail. Win/loss is
// deliberately absent; clubs care about engagement, not who beat whom.
export type MemberStatus = 'new' | 'active' | 'cooling' | 'lapsed';

export interface ClubMemberDetail {
  user_id: string;
  name: string;
  photo_url: string | null;
  handicap: number | null;
  status: MemberStatus;
  headline: string;
  member_since: string | null;
  total_matches: number;
  matches_30d: number;
  last_played: string | null;
  days_since: number | null;
  per_week: number;
  trend: { week: string; matches: number }[];
  momentum: 'rising' | 'steady' | 'cooling';
  partners_count: number;
  top_partners: (DashboardPlayer & { matches: number })[];
  looking_now: boolean;
}

// GET /clubs/:id/intros — staff-only matchmaker: members who'd click but
// haven't played each other.
export interface IntroPlayer extends DashboardPlayer { handicap: number | null; }
export interface IntroSuggestion { a: IntroPlayer; b: IntroPlayer; reason: string; }
export interface ClubIntros { suggestions: IntroSuggestion[]; }

// ── Live gamecast (playing-together match) ──────────────────────────────────
export type ToParName = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'other';

export interface GamecastHole {
  hole: number;
  par: number | null;
  creator_gross: number | null;
  opponent_gross: number | null;
  creator_to_par: number | null;
  opponent_to_par: number | null;
  creator_net: number | null;
  opponent_net: number | null;
  creator_strokes: number;
  opponent_strokes: number;
  winner: 'creator' | 'opponent' | 'tie' | null;
  creator_delta: number | null;
  status_label: string | null;
}

export interface GamecastEvent {
  hole: number;
  kind: 'win' | 'halve' | 'lead_change' | 'closeout';
  side: 'creator' | 'opponent' | null;
  score_name: ToParName | null;
  text: string;
}

export interface Gamecast {
  holes: GamecastHole[];
  holes_played: number;
  holes_remaining: number;
  creator_delta: number;
  cumulative: string;
  leader: 'creator' | 'opponent' | 'tie';
  decided_on_hole: number | null;
  final_delta: string | null;
  creator_to_par: number | null;
  opponent_to_par: number | null;
  momentum: { side: 'creator' | 'opponent' | null; won: number; of: number };
  win_prob: number[];
  current_hole: number | null;
  events: GamecastEvent[];
  creator_course_handicap?: number | null;   // shown by each name in the live header
  opponent_course_handicap?: number | null;
}

export interface LiveFollower { name: string; photo_url: string | null }
export type CheerKind = 'fire' | 'clap' | 'flag' | 'shock';
export interface Reactor { name: string; photo_url: string | null }
export type Reactors = Record<CheerKind, Reactor[]>;
export interface CheerResult { reacted: boolean; reactions: Partial<Record<CheerKind, number>>; your_reactions: CheerKind[] }

export interface LiveState {
  match_id: string;
  status: MatchStatus | null;
  playing_together: number;
  follower_count: number;
  followers: LiveFollower[];
  reactions: Partial<Record<CheerKind, number>>;
  your_reactions: CheerKind[];   // the viewer's own active reactions (toggle state)
  creator_name: string;
  opponent_name: string | null;
  creator_photo_url: string | null;
  opponent_photo_url: string | null;
  viewer_is_creator: boolean;
  viewer_is_participant: boolean;
  your_holes: number[];
  match_type: MatchType | null;
  creator_confirmed: boolean;
  opponent_confirmed: boolean;
  round_complete: boolean;
  awaiting_confirmation: boolean;
  completed: boolean;
  running: Gamecast | null;   // null for apart / no-course / spectator-of-apart
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  gif_url: string | null;
  read: number;
  created_at: string;
}

// A GIF search result (Giphy, proxied through the Worker).
export interface Gif {
  id: string;
  preview: string; // small, for the picker grid
  full: string;    // shown in the message bubble
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
  // Creator's win probability (0..100) at each point: index 0 = pre-round, then
  // one per hole. Absent on matches settled before this shipped.
  win_prob?: number[];
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
  opponent_photo_url: string | null;
}

// A head-to-head rivalry rollup (most-played opponents).
export interface Rival {
  user_id: string;
  name: string;
  photo_url: string | null;
  wins: number;
  losses: number;
  ties: number;
  played: number;
  last_outcome: Outcome;
  last_at: string | null;
}

// Per-course W–L–H rollup.
export interface CourseForm {
  course_name: string;
  wins: number;
  losses: number;
  ties: number;
  played: number;
}

export interface BestWin {
  match_id: string;
  opponent_name: string;
  course_name: string;
  final_delta: string | null;
  completed_at: string | null;
}

export interface MyRecord {
  played: number;
  wins: number;
  losses: number;
  ties: number;
  win_pct: number;
  current_streak: { type: Outcome | 'none'; count: number };
  // Optional until the Worker deploy lands — old responses simply omit them.
  longest_win_streak?: number;
  best_win?: BestWin | null;
  rivals?: Rival[];
  courses?: CourseForm[];
  recent: RecentResult[];
}

export interface LeaderboardEntry {
  user_id: string;
  name: string;
  photo_url: string | null;
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

// A course returned by the GPS nearest-course endpoint (with its distance).
export interface NearbyCourse {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  distance_km: number;
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
