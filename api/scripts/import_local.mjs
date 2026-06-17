// Local-first catalog backfill on the FREE GolfCourseAPI tier (50 req/day).
//
// Strategy: OpenStreetMap (free, unlimited) discovers every golf course NEAREST
// Prairie Highlands outward; each run spends up to DAILY_API_CAP search calls to
// pull those courses' real tees/holes from GolfCourseAPI, closest-first, and
// writes them to D1 (local + remote). Resumable via a queue checkpoint — run it
// daily (Task Scheduler) and the home metro fills in ~2 days, expanding outward
// over time. Each course is a ONE-TIME pull; once in D1 it never hits the API
// again (the app only ever reads our DB at runtime).
//
//   node scripts/import_local.mjs discover   # build the nearest-first queue (OSM, free)
//   node scripts/import_local.mjs            # pull the next ~45 courses (one day's budget)
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const KEY = process.env.GOLF_COURSE_API_KEY;
const PRAIRIE = { lat: 38.8617, lng: -94.8857 };
const DIR = '.crawl';
const QUEUE = `${DIR}/local_queue.json`;
const DAILY_API_CAP = 45;       // leave headroom under the 50/day free cap
const OSM_RADIUS_KM = 350;      // discovery reach (nearest-first regardless)
const PREFER = ['KS', 'MO', 'IA', 'NE'];
const NOISE = /driving range|^par 3|^range$|^posse$|disc golf|footgolf|^practice|miniature/i;

fs.mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/'/g, "''");
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? 'NULL' : Number(v));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const pad = (n) => String(n).padStart(2, '0');

function haversine(a, b) {
  const R = 6371, tr = (d) => (d * Math.PI) / 180;
  const dla = tr(b.lat - a.lat), dlo = tr(b.lng - a.lng);
  const x = Math.sin(dla / 2) ** 2 + Math.cos(tr(a.lat)) * Math.cos(tr(b.lat)) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

// ── DISCOVER: build the nearest-first queue from OSM (free) ───────────────────
async function discover() {
  const q = `[out:json][timeout:120];(way["leisure"="golf_course"](around:${OSM_RADIUS_KM * 1000},${PRAIRIE.lat},${PRAIRIE.lng});relation["leisure"="golf_course"](around:${OSM_RADIUS_KM * 1000},${PRAIRIE.lat},${PRAIRIE.lng}););out center tags;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: 'data=' + encodeURIComponent(q),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Foretera-golf/1.0 (bryan.babb1@gmail.com)' },
  });
  const j = JSON.parse(await r.text());
  const seen = new Set(), items = [];
  for (const e of j.elements) {
    const name = e.tags?.name;
    if (!name || NOISE.test(name)) continue;
    const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
    if (lat == null) continue;
    const k = slug(name);
    if (seen.has(k)) continue;
    seen.add(k);
    items.push({ name, lat, lng, dist: Math.round(haversine(PRAIRIE, { lat, lng }) * 10) / 10 });
  }
  items.sort((a, b) => a.dist - b.dist);

  // Pre-mark courses already in our DB so we don't waste API calls re-fetching them.
  let have = new Set();
  try {
    const out = execSync('npx wrangler d1 execute match-play --local --json --command "SELECT name FROM courses"', { encoding: 'utf8' });
    const rows = JSON.parse(out)[0]?.results ?? [];
    have = new Set(rows.map((x) => slug(x.name)));
  } catch (e) { console.error('  (could not read existing courses; continuing)', e.message); }
  const processed = items.filter((i) => have.has(slug(i.name))).map((i) => slug(i.name));

  fs.writeFileSync(QUEUE, JSON.stringify({ radiusKm: OSM_RADIUS_KM, items, processed }, null, 0));
  console.error(`discovered ${items.length} courses within ${OSM_RADIUS_KM}km; ${processed.length} already in DB. nearest: ${items[0]?.name} (${items[0]?.dist}km).`);
}

// ── GolfCourseAPI search (returns full tees/holes) ───────────────────────────
async function search(q, attempt = 1) {
  const r = await fetch(`https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(q)}`, { headers: { Authorization: `Key ${KEY}` } });
  if (r.status === 429) return { rateLimited: true };
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
// Name search returns same-named courses nationwide, so GPS proximity to where
// OSM says this course actually is — NOT name/state — is what rejects wrong
// matches (Overland Park KS vs CO, Burning Tree KS vs MI, etc.). Accept the
// nearest candidate only if it's within 30km of the OSM location, else skip.
function bestMatch(courses, osm) {
  if (!courses?.length) return null;
  const ranked = courses
    .map((c) => {
      const lat = c.location?.latitude ?? c.location?.lat, lng = c.location?.longitude ?? c.location?.lng;
      return lat == null ? null : { c, d: haversine(osm, { lat, lng }) };
    })
    .filter(Boolean)
    .sort((a, b) => a.d - b.d);
  return ranked.length && ranked[0].d <= 30 ? ranked[0].c : null;
}
function courseSQL(c) {
  const cid = `course_api_${c.id}`;
  const loc = c.location || {};
  let sql = `INSERT OR IGNORE INTO courses (id,name,city,state,latitude,longitude,created_at) VALUES ('${cid}','${esc(c.course_name)}','${esc(loc.city)}','${esc(loc.state)}',${num(loc.latitude ?? loc.lat)},${num(loc.longitude ?? loc.lng)},'2026-06-16T00:00:00.000Z');\n`;
  const tees = (c.tees?.male || []).filter((t) => t.tee_name && Array.isArray(t.holes) && t.holes.length === 18);
  for (const t of tees) {
    const tid = `tee_api_${c.id}_${slug(t.tee_name)}`;
    const fp = t.holes.slice(0, 9).reduce((a, h) => a + (Number(h.par) || 0), 0);
    const bp = t.holes.slice(9, 18).reduce((a, h) => a + (Number(h.par) || 0), 0);
    sql += `INSERT OR IGNORE INTO tees (id,course_id,name,gender,course_rating,slope_rating,par,front_course_rating,front_slope_rating,front_par,back_course_rating,back_slope_rating,back_par) VALUES ('${tid}','${cid}','${esc(t.tee_name)}','M',${num(t.course_rating)},${num(t.slope_rating)},${num(t.par_total)},${num(t.front_course_rating)},${num(t.front_slope_rating)},${fp},${num(t.back_course_rating)},${num(t.back_slope_rating)},${bp});\n`;
    t.holes.forEach((h, i) => {
      const hn = i + 1;
      sql += `INSERT OR IGNORE INTO holes (id,tee_id,hole_number,par,stroke_index) VALUES ('h_api_${c.id}_${slug(t.tee_name)}_${pad(hn)}','${tid}',${hn},${num(h.par)},${num(h.handicap)});\n`;
    });
  }
  return { sql, tees: tees.length };
}

// ── PULL: spend the day's budget on the next nearest courses ──────────────────
async function pull() {
  if (!KEY) { console.error('Set GOLF_COURSE_API_KEY'); process.exit(1); }
  if (!fs.existsSync(QUEUE)) { console.error('No queue — run `node scripts/import_local.mjs discover` first.'); process.exit(1); }
  const q = JSON.parse(fs.readFileSync(QUEUE, 'utf8'));
  const done = new Set(q.processed);
  const todo = q.items.filter((i) => !done.has(slug(i.name)));
  if (!todo.length) { console.log(`Queue complete — all ${q.items.length} local courses pulled.`); return; }

  let sql = '', calls = 0, matched = 0, missed = 0;
  for (const item of todo) {
    if (calls >= DAILY_API_CAP) break;
    calls++;
    let res;
    try { res = await search(item.name); } catch (e) { console.error(`  err "${item.name}": ${e.message}`); continue; }
    if (res.rateLimited) { console.error('  API daily quota hit — stopping; resumes next run.'); break; }
    const c = bestMatch(res.courses, { lat: item.lat, lng: item.lng });
    if (c) { const g = courseSQL(c); sql += g.sql; matched++; console.error(`  ✓ ${item.name} (${item.dist}km) → ${c.course_name} [${g.tees} tees]`); }
    else { missed++; console.error(`  – ${item.name} (${item.dist}km): no API match`); }
    q.processed.push(slug(item.name)); // mark done either way (missed = not in API)
    await sleep(1200);
  }

  if (sql) {
    const f = `${DIR}/local_batch.sql`;
    fs.writeFileSync(f, sql);
    for (const scope of ['--local', '--remote']) {
      console.error(`  applying batch ${scope}…`);
      execSync(`npx wrangler d1 execute match-play ${scope} --file "${f}" --yes`, { stdio: 'inherit', cwd: process.cwd() });
    }
  }
  fs.writeFileSync(QUEUE, JSON.stringify(q, null, 0));
  const remaining = q.items.length - q.processed.length;
  console.log(`Run done: ${calls} API calls, ${matched} loaded, ${missed} not-in-API. ${remaining} courses remaining in queue.`);
}

const mode = process.argv[2];
if (mode === 'discover') await discover();
else await pull();
