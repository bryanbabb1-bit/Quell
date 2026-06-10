// Generate completed matches for Bryan (record/streak demo) with a real
// match-play progression, so the Record tab + the reveal both work.
//   node scripts/seed_completed.mjs > seeds/bryan_completed.sql
import fs from 'node:fs';

const BRYAN = 'user_3Es8Hu1MgtEoscuILUXZWwtC0WY';
const TEE = 'tee_api_10516_blue';
const COURSE = 'Prairie Highlands Golf Course';
const PAR = [4,4,4,5,3,4,4,3,5, 4,4,5,4,3,5,3,4,4];
const SI  = [11,13,15,3,9,7,1,17,5, 10,8,6,12,14,4,16,18,2];

// Five matches, staggered so the 3 most recent are wins (a 3-win streak), then a
// loss, then a halve. Equal handicaps → net = gross (simple, deterministic-ish).
const MATCHES = [
  { id: 'm_done_1', opp: 'user_demo_01', want: 'win',  at: '2026-06-09T20:00:00.000Z' },
  { id: 'm_done_2', opp: 'user_demo_03', want: 'win',  at: '2026-06-08T19:00:00.000Z' },
  { id: 'm_done_3', opp: 'user_demo_06', want: 'win',  at: '2026-06-07T18:00:00.000Z' },
  { id: 'm_done_4', opp: 'user_demo_11', want: 'loss', at: '2026-06-06T18:00:00.000Z' },
  { id: 'm_done_5', opp: 'user_demo_14', want: 'tie',  at: '2026-06-05T18:00:00.000Z' },
];

const esc = (s) => String(s).replace(/'/g, "''");
function score(par, bias) {
  // bias < 0 => tends lower (better). Clamp to a sane gross.
  const r = Math.random();
  let d = r < 0.18 ? -1 : r < 0.62 ? 0 : r < 0.9 ? 1 : 2;
  d += bias;
  return Math.max(2, Math.min(9, par + d));
}

function build(want) {
  // bias gross so the intended side wins more holes.
  const cBias = want === 'win' ? -0.6 : want === 'loss' ? 0.5 : 0;
  const oBias = want === 'loss' ? -0.6 : want === 'win' ? 0.5 : 0;
  const holes = [];
  let delta = 0, decidedOn = null, closeoutDelta = 0, closeoutRemaining = 0;
  // Play all 18 (full gross/card); lock the result at the closeout hole.
  for (let i = 0; i < 18; i++) {
    const cg = score(PAR[i], cBias);
    const og = score(PAR[i], oBias);
    const winner = cg < og ? 'creator' : og < cg ? 'opponent' : 'tie';
    if (winner === 'creator') delta++; else if (winner === 'opponent') delta--;
    holes.push({
      hole: i + 1, creator_gross: cg, creator_strokes: 0, creator_net: cg,
      opponent_gross: og, opponent_strokes: 0, opponent_net: og, winner,
      creator_delta: delta, cumulative: delta === 0 ? 'AS' : `${Math.abs(delta)}${delta > 0 ? 'U' : 'D'}`,
    });
    const remaining = 17 - i;
    if (decidedOn === null && Math.abs(delta) > remaining) { decidedOn = i + 1; closeoutDelta = delta; closeoutRemaining = remaining; }
  }
  const resultDelta = decidedOn !== null ? closeoutDelta : delta;
  let final_result, final_delta;
  if (resultDelta > 0) final_result = 'creator_wins';
  else if (resultDelta < 0) final_result = 'opponent_wins';
  else final_result = 'tie';
  if (decidedOn !== null) final_delta = closeoutRemaining > 0 ? `${Math.abs(closeoutDelta)} & ${closeoutRemaining}` : `${Math.abs(closeoutDelta)} Up`;
  else final_delta = resultDelta === 0 ? 'All Square' : `${Math.abs(resultDelta)} Up`;
  return { holes, final_result, final_delta, decided_on_hole: decidedOn };
}

let sql = '-- bryan_completed.sql — GENERATED. Completed matches for the record/streak demo.\n' +
  "DELETE FROM scorecards WHERE match_id LIKE 'm_done_%';\nDELETE FROM matches WHERE id LIKE 'm_done_%';\n\n";

for (const m of MATCHES) {
  // retry until the computed result matches the intent (keeps the streak clean)
  let prog;
  for (let t = 0; t < 40; t++) { prog = build(m.want); const r = prog.final_result;
    if ((m.want === 'win' && r === 'creator_wins') || (m.want === 'loss' && r === 'opponent_wins') || (m.want === 'tie' && r === 'tie')) break; }
  const cCard = `sc_${m.id}_c`, oCard = `sc_${m.id}_o`;
  const cScores = prog.holes.map((h) => ({ hole: h.hole, gross: h.creator_gross }));
  const oScores = prog.holes.map((h) => ({ hole: h.hole, gross: h.opponent_gross }));
  const cTotal = cScores.reduce((a, h) => a + h.gross, 0);
  const oTotal = oScores.reduce((a, h) => a + h.gross, 0);
  sql += `INSERT INTO scorecards (id, match_id, player_id, hole_scores, total_gross, submitted_at) VALUES ('${cCard}','${m.id}','${BRYAN}','${esc(JSON.stringify(cScores))}',${cTotal},'${m.at}');\n`;
  sql += `INSERT INTO scorecards (id, match_id, player_id, hole_scores, total_gross, submitted_at) VALUES ('${oCard}','${m.id}','${m.opp}','${esc(JSON.stringify(oScores))}',${oTotal},'${m.at}');\n`;
  sql += `INSERT INTO matches (id, creator_id, opponent_id, status, course_name, tee_color, tee_id, play_date, play_time, match_type, stakes, hcp_range_min, hcp_range_max, creator_handicap, opponent_handicap, creator_scorecard_id, opponent_scorecard_id, result, match_progression, created_at, updated_at, completed_at) VALUES ('${m.id}','${BRYAN}','${m.opp}','completed','${esc(COURSE)}','Blue','${TEE}','${m.at.slice(0, 10)}',NULL,'eighteen',NULL,0,54,0,0,'${cCard}','${oCard}','${prog.final_result}','${esc(JSON.stringify(prog))}','${m.at}','${m.at}','${m.at}');\n\n`;
}

fs.writeFileSync('seeds/bryan_completed.sql', sql);
console.error('Wrote seeds/bryan_completed.sql');
