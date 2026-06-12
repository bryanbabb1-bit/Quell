// gen_big_seed.mjs — the "alive network" seed: ~52 matches spread across 8 real
// KC-metro clubs with every lifecycle state represented, so any course board a
// player opens looks like a living club (open invites, live matches, finals,
// pulse numbers).
//
//   node scripts/gen_big_seed.mjs > seeds/big_seed.sql
//   npx wrangler d1 execute match-play --local  --file=seeds/big_seed.sql
//   npx wrangler d1 execute match-play --remote --file=seeds/big_seed.sql
//
// Idempotent: clears m_big_% first. Completed matches use the SCRATCH settle
// (both handicaps locked at 0 so net = gross — no WHS adjustment needed; same
// trick as gen_activity.mjs/seed_completed.mjs). Real pars come from
// seeds/real_courses.sql for the tee each match is played from, and every match
// links a REAL tee_api_* tee on its own course (never tee_sample_blue).
//
// Bryan-involving (8): 3 completed (2 vs Jack Romano — a real rivalry — and 1
// vs Grace Liu), 2 accepted upcoming, 1 in_progress with HIS side open (real
// engine settles when he scores in-app; opponent_handicap left NULL = scratch),
// and 2 pending direct challenges for the accept/decline flow.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BRYAN = 'user_3Es8Hu1MgtEoscuILUXZWwtC0WY';

// One mid men's tee per course (ids verified against seeds/real_courses.sql).
const COURSES = [
  { name: 'Prairie Highlands Golf Course',        tee: 'tee_api_10516_blue',       color: 'Blue' },
  { name: 'Ironhorse Golf Club',                  tee: 'tee_api_17985_blue',       color: 'Blue' },
  { name: 'Falcon Ridge Golf Club',               tee: 'tee_api_18074_bluem',      color: 'Blue (M)' },
  { name: 'Sycamore Ridge Golf Club',             tee: 'tee_api_18355_blue',       color: 'Blue' },
  { name: 'Shadow Glen Golf Club',                tee: 'tee_api_18084_green',      color: 'Green' },
  { name: 'Deer Creek Golf Club',                 tee: 'tee_api_18229_white',      color: 'White' },
  { name: 'Canyon Farms Golf Club',               tee: 'tee_api_18041_bluemember', color: 'Blue (Member)' },
  { name: 'The National Golf Club Of Kansas City',tee: 'tee_api_10447_goldmember', color: 'Gold (Member)' },
];

// The 16 demo members (ids/names/handicaps as seeded in demo_matches/more_matches).
const USERS = [
  ['user_demo_01', 8.2], ['user_demo_02', 14.6], ['user_demo_03', 4.1], ['user_demo_04', 19.3],
  ['user_demo_05', 11.0], ['user_demo_06', 2.7], ['user_demo_07', 16.8], ['user_demo_08', 9.5],
  ['user_demo_09', 22.4], ['user_demo_10', 6.3], ['user_demo_11', 7.8], ['user_demo_12', 12.3],
  ['user_demo_13', 18.1], ['user_demo_14', 3.4], ['user_demo_15', 24.0], ['user_demo_16', 10.7],
];

// ── Real pars per tee, parsed from real_courses.sql ─────────────────────────
const coursesSql = readFileSync(join(ROOT, 'seeds', 'real_courses.sql'), 'utf8');
const PARS = new Map(); // tee_id -> { holeNumber: par }
for (const m of coursesSql.matchAll(/INTO holes .*VALUES \('[^']+','([^']+)',(\d+),(\d+),\d+\)/g)) {
  const [, tee, hole, par] = m;
  if (!PARS.has(tee)) PARS.set(tee, {});
  PARS.get(tee)[Number(hole)] = Number(par);
}
for (const c of COURSES) {
  if (!PARS.get(c.tee) || Object.keys(PARS.get(c.tee)).length !== 18) {
    throw new Error(`Missing pars for ${c.tee}`);
  }
}

// ── Helpers (ported from gen_activity.mjs) ──────────────────────────────────
const esc = (s) => String(s).replace(/'/g, "''");

function holeList(type) {
  if (type === 'front_nine') return Array.from({ length: 9 }, (_, i) => i + 1);
  if (type === 'back_nine') return Array.from({ length: 9 }, (_, i) => i + 10);
  return Array.from({ length: 18 }, (_, i) => i + 1);
}

// Realistic integer gross around par; tier skews the distribution.
function gross(par, tier) {
  const r = Math.random();
  let d;
  if (tier === 'good')     d = r < 0.22 ? -1 : r < 0.70 ? 0 : r < 0.92 ? 1 : 2;
  else if (tier === 'bad') d = r < 0.08 ? -1 : r < 0.45 ? 0 : r < 0.82 ? 1 : 2;
  else                     d = r < 0.15 ? -1 : r < 0.60 ? 0 : r < 0.88 ? 1 : 2;
  return Math.max(2, Math.min(9, par + d));
}

function genCard(holes, pars, tier) {
  return holes.map((h) => ({ hole: h, gross: gross(pars[h] ?? 4, tier) }));
}

// Scratch settle: handicap 0 both sides → net = gross. Full-round play (no
// break at closeout) with the result locked at the closeout hole — mirrors the
// engine's full-round behavior.
function settle(cCard, oCard) {
  let delta = 0, decided = null, lockedDelta = null, remaining = cCard.length;
  const holes = [];
  for (let i = 0; i < cCard.length; i++) {
    const cg = cCard[i].gross, og = oCard[i].gross;
    let winner = 'tie';
    if (cg < og) { winner = 'creator'; delta++; }
    else if (og < cg) { winner = 'opponent'; delta--; }
    remaining = cCard.length - (i + 1);
    if (decided == null && Math.abs(delta) > remaining) { decided = cCard[i].hole; lockedDelta = delta; }
    holes.push({
      hole: cCard[i].hole,
      creator_gross: cg, creator_strokes: 0, creator_net: cg,
      opponent_gross: og, opponent_strokes: 0, opponent_net: og,
      winner,
      creator_delta: delta,
      cumulative: delta === 0 ? 'All Square' : `${Math.abs(delta)} ${delta > 0 ? 'Up' : 'Down'}`,
    });
  }
  const finalDelta = lockedDelta ?? delta;
  const final_result = finalDelta > 0 ? 'creator_wins' : finalDelta < 0 ? 'opponent_wins' : 'tie';
  let final_delta;
  if (finalDelta === 0) final_delta = 'All Square';
  else if (decided != null) final_delta = `${Math.abs(lockedDelta)} & ${cCard.length - holes.findIndex((h) => h.hole === decided) - 1}`;
  else final_delta = `${Math.abs(finalDelta)} Up`;
  return { progression: { holes, final_result, final_delta, decided_on_hole: decided }, final_result };
}

// Regenerate until the intended winner actually wins (scratch play is random).
function settleToward(holes, pars, want /* 'creator'|'opponent'|'tie' */) {
  for (let i = 0; i < 400; i++) {
    const cTier = want === 'creator' ? 'good' : want === 'opponent' ? 'bad' : 'even';
    const oTier = want === 'creator' ? 'bad' : want === 'opponent' ? 'good' : 'even';
    const c = genCard(holes, pars, cTier);
    const o = genCard(holes, pars, oTier);
    const s = settle(c, o);
    if (want === 'tie' && s.final_result === 'tie') return { c, o, ...s };
    if (want === 'creator' && s.final_result === 'creator_wins') return { c, o, ...s };
    if (want === 'opponent' && s.final_result === 'opponent_wins') return { c, o, ...s };
  }
  throw new Error('settleToward did not converge');
}

// ── Date helpers (local clock) ──────────────────────────────────────────────
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysFromToday(n) { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); }
function ts(dayOffset, hour) {
  const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// ── SQL emitters ────────────────────────────────────────────────────────────
let out = '';
out += `-- big_seed.sql — GENERATED by scripts/gen_big_seed.mjs on ${iso(new Date())}.\n`;
out += `-- ~52 matches across 8 clubs, every lifecycle state. Idempotent.\n\n`;
out += `DELETE FROM scorecards WHERE match_id LIKE 'm_big_%';\n`;
out += `DELETE FROM matches WHERE id LIKE 'm_big_%';\n\n`;

let seq = 0;
const nextId = () => `m_big_${String(++seq).padStart(2, '0')}`;

function cardSql(id, mid, pid, scores, at) {
  const total = scores.reduce((a, h) => a + h.gross, 0);
  return `INSERT INTO scorecards (id, match_id, player_id, hole_scores, total_gross, submitted_at) VALUES ('${id}','${mid}','${pid}','${esc(JSON.stringify(scores))}',${total},'${at}');\n`;
}

function matchSql(m) {
  const v = (x) => (x == null ? 'NULL' : typeof x === 'number' ? x : `'${esc(x)}'`);
  return `INSERT INTO matches (id, creator_id, opponent_id, status, course_name, tee_color, tee_id, opponent_tee_id, opponent_tee_color, play_date, play_time, match_type, stakes, hcp_range_min, hcp_range_max, creator_scorecard_id, opponent_scorecard_id, creator_handicap, opponent_handicap, result, match_progression, visibility, created_at, updated_at, completed_at) VALUES (` +
    [m.id, m.creator_id, m.opponent_id, m.status, m.course_name, m.tee_color, m.tee_id, m.opponent_tee_id, m.opponent_tee_color,
     m.play_date, m.play_time, m.match_type, m.stakes, m.hcp_min, m.hcp_max, m.c_card, m.o_card, m.c_hcp, m.o_hcp,
     m.result, m.progression, m.visibility, m.created_at, m.updated_at, m.completed_at].map(v).join(',') + `);\n`;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const TYPES = ['eighteen', 'eighteen', 'eighteen', 'front_nine', 'back_nine'];
const TIMES = ['07:30', '08:00', '08:40', '09:10', '10:00', '13:00', '14:30', '15:10', null];

// Round-robin user pairing that avoids self-matches and overusing anyone.
let userIdx = 0;
function pair() {
  const a = USERS[userIdx % USERS.length];
  const b = USERS[(userIdx + 7) % USERS.length];
  userIdx++;
  return a[0] === b[0] ? pair() : [a, b];
}

// Window around the player's index for open invites.
const windowFor = (hcp) => [Math.max(-10, Math.round(hcp) - 6), Math.min(54, Math.round(hcp) + 8)];

function completed(course, dayOffset, want, creator, opponent, visibility = 'public') {
  const id = nextId();
  const type = pick(TYPES);
  const holes = holeList(type);
  const pars = PARS.get(course.tee);
  const { c, o, progression } = settleToward(holes, pars, want);
  const at = ts(dayOffset, 19);
  out += cardSql(`sc_${id}_c`, id, creator, c, at);
  out += cardSql(`sc_${id}_o`, id, opponent, o, at);
  out += matchSql({
    id, creator_id: creator, opponent_id: opponent, status: 'completed',
    course_name: course.name, tee_color: course.color, tee_id: course.tee,
    opponent_tee_id: course.tee, opponent_tee_color: course.color,
    play_date: daysFromToday(dayOffset), play_time: pick(TIMES), match_type: type,
    stakes: null, hcp_min: 0, hcp_max: 54,
    c_card: `sc_${id}_c`, o_card: `sc_${id}_o`, c_hcp: 0, o_hcp: 0,
    result: progression.final_result, progression: JSON.stringify(progression),
    visibility, created_at: ts(dayOffset - 1, 9), updated_at: at, completed_at: at,
  });
}

function inProgress(course, creator, opponent, { bryanSide = false } = {}) {
  const id = nextId();
  const type = pick(TYPES);
  const holes = holeList(type);
  const pars = PARS.get(course.tee);
  const c = genCard(holes, pars, 'even');
  const at = ts(0, 12);
  out += cardSql(`sc_${id}_c`, id, creator, c, at);
  out += matchSql({
    id, creator_id: creator, opponent_id: opponent, status: 'in_progress',
    course_name: course.name, tee_color: course.color, tee_id: course.tee,
    opponent_tee_id: course.tee, opponent_tee_color: course.color,
    play_date: daysFromToday(0), play_time: pick(TIMES.filter(Boolean)), match_type: type,
    stakes: null, hcp_min: 0, hcp_max: 54,
    c_card: `sc_${id}_c`, o_card: null,
    // Bryan's live match keeps REAL snapshots (his side settles via the real
    // engine when he scores in-app); demo-vs-demo live matches stay scratch.
    c_hcp: bryanSide ? USERS.find((u) => u[0] === creator)?.[1] ?? 0 : 0,
    o_hcp: bryanSide ? null : 0,
    result: null, progression: null, visibility: 'public',
    created_at: ts(-1, 9), updated_at: at, completed_at: null,
  });
}

function accepted(course, dayOffset, creator, opponent, visibility = 'public') {
  const id = nextId();
  out += matchSql({
    id, creator_id: creator, opponent_id: opponent, status: 'accepted',
    course_name: course.name, tee_color: course.color, tee_id: course.tee,
    opponent_tee_id: course.tee, opponent_tee_color: course.color,
    play_date: daysFromToday(dayOffset), play_time: pick(TIMES), match_type: pick(TYPES),
    stakes: null, hcp_min: 0, hcp_max: 54,
    c_card: null, o_card: null,
    c_hcp: USERS.find((u) => u[0] === creator)?.[1] ?? 0,
    o_hcp: opponent === BRYAN ? null : USERS.find((u) => u[0] === opponent)?.[1] ?? 0,
    result: null, progression: null, visibility,
    created_at: ts(-1, 10), updated_at: ts(-1, 11), completed_at: null,
  });
}

function openInvite(course, dayOffset, creatorEntry) {
  const id = nextId();
  const [creator, hcp] = creatorEntry;
  const [lo, hi] = windowFor(hcp);
  out += matchSql({
    id, creator_id: creator, opponent_id: null, status: 'open',
    course_name: course.name, tee_color: course.color, tee_id: course.tee,
    opponent_tee_id: null, opponent_tee_color: null,
    play_date: daysFromToday(dayOffset), play_time: pick(TIMES), match_type: pick(TYPES),
    stakes: null, hcp_min: lo, hcp_max: hi,
    c_card: null, o_card: null, c_hcp: hcp, o_hcp: null,
    result: null, progression: null, visibility: 'public',
    created_at: ts(0, 8), updated_at: ts(0, 8), completed_at: null,
  });
}

function pendingChallenge(course, dayOffset, creatorEntry, opponent) {
  const id = nextId();
  const [creator, hcp] = creatorEntry;
  out += matchSql({
    id, creator_id: creator, opponent_id: opponent, status: 'pending',
    course_name: course.name, tee_color: course.color, tee_id: course.tee,
    opponent_tee_id: null, opponent_tee_color: null,
    play_date: daysFromToday(dayOffset), play_time: pick(TIMES), match_type: pick(TYPES),
    stakes: null, hcp_min: 0, hcp_max: 54,
    c_card: null, o_card: null, c_hcp: hcp, o_hcp: null,
    result: null, progression: null, visibility: 'private',
    created_at: ts(0, 9), updated_at: ts(0, 9), completed_at: null,
  });
}

// ── The spread ──────────────────────────────────────────────────────────────
const [PH, IRON, FALCON, SYC, SHADOW, DEER, CANYON, NATL] = COURSES;
const RESULTS = ['creator', 'opponent', 'creator', 'tie', 'opponent', 'creator'];

out += `-- ── Completed (last 7 days) ─────────────────────────────────────────\n`;
// 19 demo-vs-demo finals spread across all 8 clubs and the past week.
const completedPlan = [
  [PH, -1], [PH, -2], [PH, -4], [PH, 0],
  [IRON, -1], [IRON, -3], [IRON, -6],
  [FALCON, -2], [FALCON, -5],
  [SYC, -1], [SYC, -4],
  [SHADOW, -2], [SHADOW, -6],
  [DEER, -3], [DEER, 0],
  [CANYON, -1], [CANYON, -5],
  [NATL, -2], [NATL, -4],
];
completedPlan.forEach(([course, day], i) => {
  const [a, b] = pair();
  completed(course, day, RESULTS[i % RESULTS.length], a[0], b[0], i % 6 === 5 ? 'private' : 'public');
});
// Bryan's 3: a rivalry vs Jack Romano (1W 1L) + a halve vs Grace Liu, at his home club.
completed(PH, -1, 'creator', BRYAN, 'user_demo_14');
completed(PH, -3, 'opponent', BRYAN, 'user_demo_14');
completed(PH, -5, 'tie', BRYAN, 'user_demo_11');

out += `\n-- ── Live today (in_progress: creator card in) ───────────────────────\n`;
inProgress(PH, 'user_demo_03', 'user_demo_09');
inProgress(IRON, 'user_demo_05', 'user_demo_12');
inProgress(SYC, 'user_demo_07', 'user_demo_16');
inProgress(DEER, 'user_demo_02', 'user_demo_10');
inProgress(NATL, 'user_demo_06', 'user_demo_13');
// Bryan's live match — HIS side open, real engine settles when he scores.
inProgress(PH, 'user_demo_08', BRYAN, { bryanSide: true });

out += `\n-- ── Scheduled (accepted) ────────────────────────────────────────────\n`;
accepted(PH, 0, 'user_demo_01', 'user_demo_15');
accepted(IRON, 1, 'user_demo_04', 'user_demo_11');
accepted(FALCON, 0, 'user_demo_13', 'user_demo_02');
accepted(SHADOW, 1, 'user_demo_09', 'user_demo_05', 'private');
accepted(CANYON, 0, 'user_demo_16', 'user_demo_07');
accepted(NATL, 1, 'user_demo_12', 'user_demo_03');
// Bryan's 2 upcoming.
accepted(PH, 1, 'user_demo_10', BRYAN);
accepted(FALCON, 2, 'user_demo_06', BRYAN);

out += `\n-- ── Open invites (looking for a game) ───────────────────────────────\n`;
const openPlan = [
  [PH, 0], [PH, 1], [PH, 3],
  [IRON, 0], [IRON, 2],
  [FALCON, 1], [FALCON, 4],
  [SYC, 0], [SYC, 5],
  [SHADOW, 1],
  [DEER, 2], [DEER, 7],
  [CANYON, 3],
  [NATL, 6],
];
openPlan.forEach(([course, day], i) => openInvite(course, day, USERS[(i * 3 + 1) % USERS.length]));

out += `\n-- ── Direct challenges to Bryan (pending) ────────────────────────────\n`;
pendingChallenge(PH, 2, USERS[13] /* Jack Romano — the rival wants a rubber match */, BRYAN);
pendingChallenge(SYC, 4, USERS[4] /* Sam Whitfield */, BRYAN);

process.stdout.write(out);
console.error(`Generated ${seq} matches.`);
