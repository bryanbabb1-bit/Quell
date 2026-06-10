// Import real course data from GolfCourseAPI -> seeds/real_courses.sql.
// Needs GOLF_COURSE_API_KEY in the env (stored as a Windows User env var; never
// committed). Run from the api/ folder:  node scripts/import_courses.mjs
//
// Maps each course's MALE solid-color tees (par_total + CR/Slope + front/back
// splits) and per-hole {par, handicap=stroke index} onto our courses/tees/holes
// schema. Idempotent SQL (INSERT OR REPLACE by id). The first batch of queries
// is the KC-metro beta set (matches the demo-match course names).
import fs from 'node:fs';

const KEY = process.env.GOLF_COURSE_API_KEY;
if (!KEY) { console.error('Set GOLF_COURSE_API_KEY first.'); process.exit(1); }

// Just the course name — the search matches names, and appending a city returns
// nothing. We prefer a KS/MO result when several courses share a name.
const QUERIES = [
  'prairie highlands',
  'ironhorse',
  'falcon ridge',
  'sycamore ridge',
  'shadow glen',
  'deer creek',
  'tomahawk hills',
  'canyon farms',
  'the national',
  'tiffany greens',
  'shoal creek',
];
const PREFER_STATES = ['KS', 'MO'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? 'NULL' : Number(v));
const esc = (s) => String(s ?? '').replace(/'/g, "''");
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

async function search(q, attempt = 1) {
  const r = await fetch(`https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Key ${KEY}` },
  });
  if (r.status === 429 && attempt <= 5) {
    const wait = 3000 * attempt;
    console.error(`  rate-limited, waiting ${wait}ms…`);
    await sleep(wait);
    return search(q, attempt + 1);
  }
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

function bestMatch(courses, q) {
  if (!courses?.length) return null;
  const inState = courses.filter((c) => PREFER_STATES.includes(c.location?.state));
  const pool = inState.length ? inState : courses;
  // exact-ish: prefer a name that starts with the query
  const ql = q.toLowerCase();
  return pool.find((c) => (c.course_name || '').toLowerCase().startsWith(ql)) ?? pool[0];
}

const picked = [];
const seen = new Set();
for (const q of QUERIES) {
  try {
    const res = await search(q);
    const c = bestMatch(res.courses, q);
    if (!c) { console.error('  no result:', q); }
    else if (seen.has(c.id)) { console.error('  dup:', c.course_name); }
    else { picked.push(c); seen.add(c.id); console.error('  ok:', c.course_name, `${c.location?.city}, ${c.location?.state} (id ${c.id})`); }
  } catch (e) {
    console.error('  err:', q, e.message);
  }
  await sleep(1800); // throttle to stay under the free-tier rate limit
}

let sql =
  '-- real_courses.sql — GENERATED from GolfCourseAPI (node scripts/import_courses.mjs).\n' +
  '-- Real par + stroke index + USGA CR/Slope. Idempotent (INSERT OR REPLACE by id).\n' +
  "-- Replaces the earlier STAND-IN catalog courses.\n" +
  "DELETE FROM holes WHERE tee_id IN (SELECT id FROM tees WHERE course_id IN ('course_prairie','course_ironhorse','course_falcon'));\n" +
  "DELETE FROM tees WHERE course_id IN ('course_prairie','course_ironhorse','course_falcon');\n" +
  "DELETE FROM courses WHERE id IN ('course_prairie','course_ironhorse','course_falcon');\n\n";

let teeCount = 0, holeCount = 0;
for (const c of picked) {
  const cid = `course_api_${c.id}`;
  const loc = c.location || {};
  sql += `INSERT OR REPLACE INTO courses (id, name, city, state, created_at) VALUES ('${cid}','${esc(c.course_name)}','${esc(loc.city)}','${esc(loc.state)}','2026-06-09T00:00:00.000Z');\n`;

  const tees = (c.tees?.male || []).filter(
    (t) => t.tee_name && !t.tee_name.includes('/') && Array.isArray(t.holes) && t.holes.length === 18,
  );
  for (const t of tees) {
    const tid = `tee_api_${c.id}_${slugify(t.tee_name)}`;
    const frontPar = t.holes.slice(0, 9).reduce((a, h) => a + (Number(h.par) || 0), 0);
    const backPar = t.holes.slice(9, 18).reduce((a, h) => a + (Number(h.par) || 0), 0);
    sql += `INSERT OR REPLACE INTO tees (id, course_id, name, gender, course_rating, slope_rating, par, front_course_rating, front_slope_rating, front_par, back_course_rating, back_slope_rating, back_par) VALUES ('${tid}','${cid}','${esc(t.tee_name)}','M',${num(t.course_rating)},${num(t.slope_rating)},${num(t.par_total)},${num(t.front_course_rating)},${num(t.front_slope_rating)},${frontPar},${num(t.back_course_rating)},${num(t.back_slope_rating)},${backPar});\n`;
    teeCount++;
    t.holes.forEach((h, i) => {
      const hn = i + 1;
      sql += `INSERT OR REPLACE INTO holes (id, tee_id, hole_number, par, stroke_index) VALUES ('h_api_${c.id}_${slugify(t.tee_name)}_${String(hn).padStart(2, '0')}','${tid}',${hn},${num(h.par)},${num(h.handicap)});\n`;
      holeCount++;
    });
  }
  sql += '\n';
}

fs.writeFileSync('seeds/real_courses.sql', sql);
console.error(`\nWrote seeds/real_courses.sql — ${picked.length} courses, ${teeCount} tees, ${holeCount} holes.`);
