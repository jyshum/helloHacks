import { haversineKm, type LatLng } from "@/lib/geo";

export const MAX_DETOUR_MINUTES = 8;

export function isValidMatch(detourMinutes: number): boolean {
  return detourMinutes <= MAX_DETOUR_MINUTES;
}

type RouteTotals = { seconds: number; meters: number };

// Server key if set (lets you referrer-lock the browser key), else the public one.
function mapsKey() {
  return process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
}

async function directions(origin: LatLng, dest: LatLng, waypoint?: LatLng): Promise<RouteTotals> {
  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${dest.lat},${dest.lng}`,
    mode: "driving",
    key: mapsKey(),
  });
  if (waypoint) params.set("waypoints", `${waypoint.lat},${waypoint.lng}`);
  const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`, { cache: "no-store" });
  const body = await res.json();
  if (body.status !== "OK") throw new Error(`Directions ${body.status}`);
  const legs: { duration: { value: number }; distance: { value: number } }[] = body.routes[0].legs;
  return legs.reduce((t, l) => ({ seconds: t.seconds + l.duration.value, meters: t.meters + l.distance.value }), { seconds: 0, meters: 0 });
}

// Offline estimate if Directions is unreachable: straight line x1.35 road factor at 35 km/h.
function estimate(points: LatLng[]): RouteTotals {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]) * 1.35;
  return { meters: km * 1000, seconds: (km / 35) * 3600 };
}

export async function calculateDetour(
  driverOrigin: LatLng,
  driverDest: LatLng,
  riderPickup: LatLng
): Promise<{ detourMinutes: number; detourKm: number; estimated: boolean }> {
  let direct: RouteTotals, withPickup: RouteTotals, estimated = false;
  try {
    [direct, withPickup] = await Promise.all([
      directions(driverOrigin, driverDest),
      directions(driverOrigin, driverDest, riderPickup),
    ]);
  } catch {
    estimated = true;
    direct = estimate([driverOrigin, driverDest]);
    withPickup = estimate([driverOrigin, riderPickup, driverDest]);
  }
  const detourMinutes = Math.max(0, (withPickup.seconds - direct.seconds) / 60);
  const detourKm = Math.max(0, (withPickup.meters - direct.meters) / 1000);
  return {
    detourMinutes: Math.round(detourMinutes * 10) / 10,
    detourKm: Math.round(detourKm * 10) / 10,
    estimated,
  };
}
