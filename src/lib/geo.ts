export type LatLng = { lat: number; lng: number };

export const UBC: LatLng = { lat: 49.2677, lng: -123.247 }; // UBC Bus Exchange
export const VANCOUVER_CENTER: LatLng = { lat: 49.245, lng: -123.19 };

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Point at fraction t (0..1) of the way along a path, by distance.
export function pointAlong(path: LatLng[], t: number): LatLng {
  if (path.length === 0) return UBC;
  if (path.length === 1 || t <= 0) return path[0];
  if (t >= 1) return path[path.length - 1];
  const segs = path.slice(1).map((p, i) => haversineKm(path[i], p));
  const total = segs.reduce((a, b) => a + b, 0);
  let remaining = total * t;
  for (let i = 0; i < segs.length; i++) {
    if (remaining <= segs[i]) {
      const f = segs[i] === 0 ? 0 : remaining / segs[i];
      return {
        lat: path[i].lat + (path[i + 1].lat - path[i].lat) * f,
        lng: path[i].lng + (path[i + 1].lng - path[i].lng) * f,
      };
    }
    remaining -= segs[i];
  }
  return path[path.length - 1];
}

// Shortest distance from a point to any vertex of a path. Good enough at city scale.
export function distanceToPathKm(p: LatLng, path: LatLng[]): number {
  return path.reduce((min, q) => Math.min(min, haversineKm(p, q)), Infinity);
}

// Rough city driving ETA: straight line x1.35 road factor at 30 km/h.
export function etaMinutes(a: LatLng, b: LatLng): number {
  return Math.max(1, Math.round(((haversineKm(a, b) * 1.35) / 30) * 60));
}

// Decodes a Google encoded polyline into points.
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    for (const coord of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do {
        b = encoded.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (coord === 0) lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

// Closest point on a path to p (checks every segment, not just vertices).
export function closestPointOnPath(p: LatLng, path: LatLng[]): { point: LatLng; km: number; index: number } {
  let best = { point: path[0] ?? p, km: Infinity, index: 0 };
  const kx = Math.cos((p.lat * Math.PI) / 180); // flatten lng at this latitude
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const ax = a.lng * kx, ay = a.lat, bx = b.lng * kx, by = b.lat, px = p.lng * kx, py = p.lat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const q = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    const km = haversineKm(p, q);
    if (km < best.km) best = { point: q, km, index: i };
  }
  return best;
}
