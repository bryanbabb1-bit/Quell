// gen_live_demo.mjs — a handful of SAME-GROUP, in-progress, PUBLIC matches with
// partial cards, so live scoring + spectating is testable (the big seed predates
// playing_together, so nothing was same-group). Scratch (handicap 0 → net=gross).
//
//   node scripts/gen_live_demo.mjs > seeds/live_demo.sql
//   wrangler d1 execute match-play --local  --file=seeds/live_demo.sql
//   wrangler d1 execute match-play --remote --file=seeds/live_demo.sql
// Idempotent (clears m_live_% first).

const BRYAN = 'user_3Es8Hu1MgtEoscuILUXZWwtC0WY';
const esc = (s) => String(s).replace(/'/g, "''");
const PAR = { 1:4,2:4,3:4,4:5,5:3,6:4,7:4,8:3,9:5,10:4,11:4,12:5,13:4,14:3,15:5,16:3,17:4,18:4 };

function card(holes, tier) {
  // tier shifts the gross a touch so the two sides differ hole to hole.
  return holes.map((h) => {
    const par = PAR[h] ?? 4;
    const d = tier === 'low' ? (h % 3 === 0 ? -1 : 0) : (h % 4 === 0 ? 1 : 0);
    return { hole: h, gross: Math.max(2, par + d) };
  });
}
function iso(daysAgo, hour) {
  // Stable-ish timestamps without Date.now randomness concerns (script-time).
  const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let out = '';
out += `-- live_demo.sql — same-group in-progress public matches for live testing.\n`;
out += `DELETE FROM scorecards WHERE match_id LIKE 'm_live_%';\n`;
out += `DELETE FROM match_followers WHERE match_id LIKE 'm_live_%';\n`;
out += `DELETE FROM matches WHERE id LIKE 'm_live_%';\n\n`;

function cardSql(id, mid, pid, scores, at) {
  const total = scores.reduce((a, h) => a + h.gross, 0);
  return `INSERT INTO scorecards (id, match_id, player_id, hole_scores, total_gross, submitted_at) VALUES ('${id}','${mid}','${pid}','${esc(JSON.stringify(scores))}',${total},'${at}');\n`;
}

function matchSql(m) {
  const v = (x) => (x == null ? 'NULL' : typeof x === 'number' ? x : `'${esc(x)}'`);
  return `INSERT INTO matches (id, creator_id, opponent_id, status, course_name, tee_color, tee_id, opponent_tee_id, opponent_tee_color, play_date, play_time, match_type, stakes, hcp_range_min, hcp_range_max, creator_scorecard_id, opponent_scorecard_id, creator_handicap, opponent_handicap, result, match_progression, visibility, playing_together, created_at, updated_at, completed_at) VALUES (` +
    [m.id, m.creator, m.opponent, 'in_progress', m.course, m.color, m.tee, m.tee, m.color,
     today(), m.time, 'eighteen', null, 0, 54, m.c_card, m.o_card, 0, 0,
     null, null, 'public', 1, iso(0, 8), iso(0, 12), null].map(v).join(',') + `);\n`;
}

// (course, tee, color, creator, opponent, creatorThru, opponentThru, time)
const MATCHES = [
  ['m_live_01', 'Falcon Ridge Golf Club', 'tee_api_18074_bluem', 'Blue (M)', 'user_demo_03', 'user_demo_09', 6, 6, '08:00'],
  ['m_live_02', 'Prairie Highlands Golf Course', 'tee_api_10516_blue', 'Blue', 'user_demo_05', 'user_demo_12', 9, 8, '08:40'],
  ['m_live_03', 'Ironhorse Golf Club', 'tee_api_17985_blue', 'Blue', 'user_demo_07', 'user_demo_16', 4, 4, '09:10'],
  // Bryan participates — his side is a few holes behind so he can post live.
  ['m_live_bryan', 'Prairie Highlands Golf Course', 'tee_api_10516_blue', 'Blue', BRYAN, 'user_demo_08', 3, 5, '07:30'],
];

const range = Array.from({ length: 18 }, (_, i) => i + 1);
for (const [id, course, tee, color, creator, opponent, cThru, oThru, time] of MATCHES) {
  const cCard = card(range.slice(0, cThru), 'low');
  const oCard = card(range.slice(0, oThru), 'high');
  if (cThru > 0) out += cardSql(`sc_${id}_c`, id, creator, cCard, iso(0, 11));
  if (oThru > 0) out += cardSql(`sc_${id}_o`, id, opponent, oCard, iso(0, 11));
  out += matchSql({
    id, course, tee, color, creator, opponent, time,
    c_card: cThru > 0 ? `sc_${id}_c` : null,
    o_card: oThru > 0 ? `sc_${id}_o` : null,
  });
  out += '\n';
}

process.stdout.write(out);
console.error(`Generated ${MATCHES.length} live demo matches.`);
