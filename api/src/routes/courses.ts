import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { json, error } from '../lib/response';

const haversineKm = (la1: number, lo1: number, la2: number, lo2: number): number => {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dla = toRad(la2 - la1), dlo = toRad(lo2 - lo1);
  const a = Math.sin(dla / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
};

// Read-only course catalog (build-order: feeds the create-match course picker).
//   GET /courses             list courses
//   GET /courses/near?lat=&lng=&limit=   nearest courses to a point (GPS)
//   GET /courses/:id         course with its tees and each tee's 18 holes
export async function handleCourses(
  request: Request,
  _auth: AuthContext,
  env: Env,
  segments: string[]
): Promise<Response> {
  if (request.method !== 'GET') return error('Method not allowed', 405);
  const id = segments[1];

  if (!id) {
    const { results } = await env.DB.prepare(
      'SELECT id, name, city, state FROM courses ORDER BY name'
    ).all();
    return json({ courses: results });
  }

  // Nearest courses to a GPS point — a bounding-box prefilter (uses idx_courses_geo,
  // so it stays fast as the catalog grows to 30k) then haversine-sort in the Worker.
  if (id === 'near') {
    const url = new URL(request.url);
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return error('valid lat and lng are required', 400);
    }
    const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('limit')) || 6));
    const RADIUS_KM = 50;
    const dLat = RADIUS_KM / 111;
    const dLng = RADIUS_KM / (111 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
    const { results } = await env.DB.prepare(
      `SELECT id, name, city, state, latitude, longitude FROM courses
        WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`
    ).bind(lat - dLat, lat + dLat, lng - dLng, lng + dLng).all<Record<string, any>>();
    const near = (results ?? [])
      .map((c) => ({
        id: c.id, name: c.name, city: c.city, state: c.state,
        distance_km: Math.round(haversineKm(lat, lng, c.latitude, c.longitude) * 100) / 100,
      }))
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, limit);
    return json({ courses: near });
  }

  const course = await env.DB.prepare('SELECT * FROM courses WHERE id = ?').bind(id).first();
  if (!course) return error('Course not found', 404);

  const tees = await env.DB.prepare(
    'SELECT * FROM tees WHERE course_id = ? ORDER BY course_rating DESC'
  ).bind(id).all();

  const teesWithHoles = await Promise.all(
    (tees.results as any[]).map(async (tee) => {
      const holes = await env.DB.prepare(
        'SELECT hole_number, par, stroke_index FROM holes WHERE tee_id = ? ORDER BY hole_number'
      ).bind(tee.id).all();
      return { ...tee, holes: holes.results };
    })
  );

  return json({ course, tees: teesWithHoles });
}
