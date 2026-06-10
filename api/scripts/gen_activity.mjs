// Generate match activity for testing the feed + reveals:
//   node scripts/gen_activity.mjs > /dev/null   (writes seeds/feed_activity.sql)
//
// 1. Complete Bryan's two in-progress matches (he already scored) by scoring the
//    OTHER side, so he has finished reveals to watch. Scratch settle (handicap 0,
//    net = gross) — same simplification as seed_completed.mjs.
// 2. "Score the other side" on three of Bryan's ACCEPTED matches → in_progress,
//    waiting on Bryan (he plays + reveals them himself in-app, real handicaps).
// 3. Demo-vs-demo PUBLIC matches at Prairie Highlands for the course feed: some
//    completed (Final results), some in_progress + accepted (Now playing).
import fs from 'node:fs';

const BRYAN = 'user_3Es8Hu1MgtEoscuILUXZWwtC0WY';
const COURSE = 'Prairie Highlands Golf Course';
const PH_TEE = 'tee_api_10516_blue';
const esc = (s) => String(s).replace(/'/g, "''");

// ── Scratch settle (a port of computeMatch with strokeDifference = 0) ─────────
function settle(creatorGross, opponentGross, firstHole) {
  const total = creatorGross.length;
  let delta = 0, decidedOn = null, closeoutDelta = 0, closeoutRemaining = 0;
  const holes = [];
  for (let i = 0; i < total; i++) {
    const cg = creatorGross[i], og = opponentGross[i];
    let winner = 'tie';
    if (cg < og) { winner = 'creator'; delta++; }
    else if (og < cg) { winner = 'opponent'; delta--; }
    holes.push({
      hole: firstHole + i, creator_gross: cg, creator_strokes: 0, creator_net: cg,
      opponent_gross: og, opponent_strokes: 0, opponent_net: og, winner,
      creator_delta: delta, cumulative: delta === 0 ? 'All Square' : `${Math.abs(delta)} ${delta > 0 ? 'Up' : 'Down'}`,
    });
    const remaining = total - (i + 1);
    if (decidedOn === null && Math.abs(delta) > remaining) { decidedOn = firstHole + i; closeoutDelta = delta; closeoutRemaining = remaining; }
  }
  const resultDelta = decidedOn !== null ? closeoutDelta : delta;
  const final_result = resultDelta > 0 ? 'creator_wins' : resultDelta < 0 ? 'opponent_wins' : 'tie';
  const final_delta = decidedOn !== null
    ? (closeoutRemaining > 0 ? `${Math.abs(closeoutDelta)} & ${closeoutRemaining}` : `${Math.abs(closeoutDelta)} Up`)
    : (resultDelta === 0 ? 'All Square' : `${Math.abs(resultDelta)} Up`);
  return { holes, final_result, final_delta, decided_on_hole: decidedOn };
}

// Realistic integer gross around par. tier skews the distribution.
const PAR = { // par by hole at Prairie Highlands (matches seed_completed)
  1:4,2:4,3:4,4:5,5:3,6:4,7:4,8:3,9:5, 10:4,11:4,12:5,13:4,14:3,15:5,16:3,17:4,18:4,
};
function gross(hole, tier) {
  const par = PAR[hole] ?? 4;
  const r = Math.random();
  let d;
  if (tier === 'good')      d = r < 0.22 ? -1 : r < 0.70 ? 0 : r < 0.92 ? 1 : 2;
  else if (tier === 'bad')  d = r < 0.08 ? -1 : r < 0.45 ? 0 : r < 0.82 ? 1 : 2;
  else                      d = r < 0.15 ? -1 : r < 0.60 ? 0 : r < 0.88 ? 1 : 2;
  return Math.max(2, Math.min(9, par + d));
}
function genCard(holes, tier) { return holes.map((h) => ({ hole: h, gross: gross(h, tier) })); }
function holeList(type) {
  if (type === 'front_nine') return [1,2,3,4,5,6,7,8,9];
  if (type === 'back_nine') return [10,11,12,13,14,15,16,17,18];
  return Array.from({ length: 18 }, (_, i) => i + 1);
}
// Settle toward a desired result by retrying the generated side. `fixedGross` is
// one player's real card (the opponent here); `wantResult` is the target
// final_result. Falls back to the last attempt if it never hits the target.
function settleToward(holes, fixedGross, wantCreatorTier, wantResult) {
  let last;
  for (let t = 0; t < 80; t++) {
    const genGross = holes.map((h) => gross(h, wantCreatorTier));
    const prog = settle(genGross, fixedGross, holes[0]); // creator = generated, opponent = fixed
    last = { prog, genGross };
    if (prog.final_result === wantResult) return last;
  }
  return last;
}

const cardSql = (id, mid, pid, scores, at) => {
  const total = scores.reduce((a, h) => a + h.gross, 0);
  return `INSERT INTO scorecards (id, match_id, player_id, hole_scores, total_gross, submitted_at) VALUES ('${id}','${mid}','${pid}','${esc(JSON.stringify(scores))}',${total},'${at}');\n`;
};

let sql = '-- feed_activity.sql — GENERATED. Test activity for the feed + reveals.\n\n';

// ── 1. Complete Bryan's two in-progress matches (score the other/creator side) ──
// Bryan is the OPPONENT on both; his real card stays. Scratch settle.
const BRYAN_IN_PROGRESS = [
  { id: 'm_demo_11', type: 'eighteen', creator: 'user_demo_11',
    bryanCard: [3,3,6,4,5,4,3,5,3,5,3,3,4,4,4,3,4,3], creatorTier: 'bad', want: 'opponent_wins' }, // Bryan wins
  { id: 'm_demo_04', type: 'back_nine', creator: 'user_demo_04',
    bryanCard: [4,2,4,4,5,5,2,6,5], creatorTier: 'good', want: 'creator_wins' },                  // Bryan loses
];
sql += '-- 1. Complete Bryan\'s in-progress matches (other side scored).\n';
for (const m of BRYAN_IN_PROGRESS) {
  const holes = holeList(m.type);
  const at = '2026-06-10T20:30:00.000Z';
  const { prog, genGross } = settleToward(holes, m.bryanCard, m.creatorTier, m.want);
  const cCard = `sc_${m.id}_c`;
  const cScores = holes.map((h, i) => ({ hole: h, gross: genGross[i] }));
  sql += `DELETE FROM scorecards WHERE id='${cCard}';\n`;
  sql += cardSql(cCard, m.id, m.creator, cScores, at);
  sql += `UPDATE matches SET creator_scorecard_id='${cCard}', creator_handicap=0, opponent_handicap=0, result='${prog.final_result}', match_progression='${esc(JSON.stringify(prog))}', status='completed', completed_at='${at}', updated_at='${at}' WHERE id='${m.id}';\n\n`;
}

// ── 2. Score the OTHER side on Bryan's accepted matches → in_progress ──────────
// Bryan is the opponent; the creator (demo user) submits first. Bryan's side
// stays open + handicaps untouched, so when he scores in-app the real engine
// settles with real handicaps.
const BRYAN_ACCEPTED = [
  { id: 'm_seed_01', type: 'eighteen',  creator: 'user_demo_01' },
  { id: 'm_seed_02', type: 'front_nine', creator: 'user_demo_03' },
  { id: 'm_seed_05', type: 'eighteen',  creator: 'user_demo_14' },
];
sql += '-- 2. Score the other side on Bryan\'s accepted matches (waiting on Bryan).\n';
for (const m of BRYAN_ACCEPTED) {
  const holes = holeList(m.type);
  const at = '2026-06-10T18:00:00.000Z';
  const cCard = `sc_${m.id}_c`;
  const cScores = genCard(holes, 'even');
  sql += `DELETE FROM scorecards WHERE id='${cCard}';\n`;
  sql += cardSql(cCard, m.id, m.creator, cScores, at);
  sql += `UPDATE matches SET creator_scorecard_id='${cCard}', status='in_progress', updated_at='${at}' WHERE id='${m.id}';\n\n`;
}

// ── 3. Demo-vs-demo PUBLIC matches at Prairie Highlands for the feed ───────────
// completed → Final results (+ Bryan can reveal from the feed as a spectator);
// in_progress / accepted → Now playing.
const DEMO = [
  // completed
  { n: 1, c: 'user_demo_02', o: 'user_demo_05', date: '2026-06-10', time: '08:10', state: 'completed' },
  { n: 2, c: 'user_demo_07', o: 'user_demo_09', date: '2026-06-10', time: '09:30', state: 'completed' },
  { n: 3, c: 'user_demo_10', o: 'user_demo_13', date: '2026-06-10', time: '12:40', state: 'completed' },
  { n: 4, c: 'user_demo_15', o: 'user_demo_16', date: '2026-06-11', time: '08:00', state: 'completed' },
  // in_progress (creator card only)
  { n: 5, c: 'user_demo_06', o: 'user_demo_08', date: '2026-06-10', time: '13:20', state: 'in_progress' },
  { n: 6, c: 'user_demo_12', o: 'user_demo_02', date: '2026-06-10', time: '14:00', state: 'in_progress' },
  // accepted / unstarted
  { n: 7, c: 'user_demo_03', o: 'user_demo_07', date: '2026-06-10', time: '15:30', state: 'accepted' },
  { n: 8, c: 'user_demo_09', o: 'user_demo_11', date: '2026-06-11', time: '09:15', state: 'accepted' },
  { n: 9, c: 'user_demo_05', o: 'user_demo_16', date: '2026-06-11', time: '10:00', state: 'accepted' },
];
sql += '-- 3. Demo-vs-demo PUBLIC matches at Prairie Highlands (feed).\n';
sql += "DELETE FROM scorecards WHERE match_id LIKE 'm_feed_demo_%';\nDELETE FROM matches WHERE id LIKE 'm_feed_demo_%';\n";
const holes18 = holeList('eighteen');
for (const m of DEMO) {
  const id = `m_feed_demo_${String(m.n).padStart(2, '0')}`;
  const created = `${m.date}T${m.time}:00.000Z`;
  const base = `('${id}','${m.c}','${m.o}',`;
  if (m.state === 'completed') {
    const cScores = genCard(holes18, 'even');
    const oScores = genCard(holes18, 'even');
    const prog = settle(cScores.map((h) => h.gross), oScores.map((h) => h.gross), 1);
    const cCard = `sc_${id}_c`, oCard = `sc_${id}_o`;
    sql += cardSql(cCard, id, m.c, cScores, created);
    sql += cardSql(oCard, id, m.o, oScores, created);
    sql += `INSERT INTO matches (id, creator_id, opponent_id, status, course_name, tee_color, tee_id, opponent_tee_id, opponent_tee_color, play_date, play_time, match_type, stakes, hcp_range_min, hcp_range_max, creator_handicap, opponent_handicap, creator_scorecard_id, opponent_scorecard_id, result, match_progression, visibility, created_at, updated_at, completed_at) VALUES ${base}'completed','${esc(COURSE)}','Blue','${PH_TEE}','${PH_TEE}','Blue','${m.date}','${m.time}','eighteen',NULL,0,54,0,0,'${cCard}','${oCard}','${prog.final_result}','${esc(JSON.stringify(prog))}','public','${created}','${created}','${created}');\n`;
  } else if (m.state === 'in_progress') {
    const cScores = genCard(holes18, 'even');
    const cCard = `sc_${id}_c`;
    sql += cardSql(cCard, id, m.c, cScores, created);
    sql += `INSERT INTO matches (id, creator_id, opponent_id, status, course_name, tee_color, tee_id, opponent_tee_id, opponent_tee_color, play_date, play_time, match_type, stakes, hcp_range_min, hcp_range_max, creator_handicap, opponent_handicap, creator_scorecard_id, visibility, created_at, updated_at) VALUES ${base}'in_progress','${esc(COURSE)}','Blue','${PH_TEE}','${PH_TEE}','Blue','${m.date}','${m.time}','eighteen',NULL,0,54,8,10,'${cCard}','public','${created}','${created}');\n`;
  } else {
    sql += `INSERT INTO matches (id, creator_id, opponent_id, status, course_name, tee_color, tee_id, opponent_tee_id, opponent_tee_color, play_date, play_time, match_type, stakes, hcp_range_min, hcp_range_max, creator_handicap, opponent_handicap, visibility, created_at, updated_at) VALUES ${base}'accepted','${esc(COURSE)}','Blue','${PH_TEE}','${PH_TEE}','Blue','${m.date}','${m.time}','eighteen',NULL,0,54,9,11,'public','${created}','${created}');\n`;
  }
}

fs.writeFileSync('seeds/feed_activity.sql', sql);
console.error(`Wrote seeds/feed_activity.sql (${sql.length} bytes)`);
