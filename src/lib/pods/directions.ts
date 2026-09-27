import { haversineKm, type LatLng } from "@/lib/geo";

function key() {
  return process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
}

// Driving route: encoded polyline + minutes. Falls back to a straight-line estimate.
export async function driveRoute(from: LatLng, to: LatLng): Promise<{ polyline: string | null; minutes: number }> {
  try {
    const params = new URLSearchParams({ origin: `${from.lat},${from.lng}`, destination: `${to.lat},${to.lng}`, mode: "driving", key: key() });
    const body = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`, { cache: "no-store" }).then((r) => r.json());
    if (body.status !== "OK") throw new Error(body.status);
    const route = body.routes[0];
    const seconds = route.legs.reduce((s: number, l: { duration: { value: number } }) => s + l.duration.value, 0);
    return { polyline: route.overview_polyline.points, minutes: Math.round(seconds / 60) };
  } catch {
    return { polyline: null, minutes: Math.round(((haversineKm(from, to) * 1.35) / 35) * 60) };
  }
}

// Transit door-to-door minutes arriving by `arriveAt`. null if Google has no transit route.
export async function transitMinutes(from: LatLng, to: LatLng, arriveAt: Date): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      origin: `${from.lat},${from.lng}`,
      destination: `${to.lat},${to.lng}`,
      mode: "transit",
      arrival_time: String(Math.floor(arriveAt.getTime() / 1000)),
      key: key(),
    });
    const body = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`, { cache: "no-store" }).then((r) => r.json());
    if (body.status !== "OK") return null;
    const seconds = body.routes[0].legs.reduce((s: number, l: { duration: { value: number } }) => s + l.duration.value, 0);
    return Math.round(seconds / 60);
  } catch {
    return null;
  }
}
