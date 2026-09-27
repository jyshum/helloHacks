import { decodePolyline, haversineKm, type LatLng } from "@/lib/geo";

// A point ~400 m along the driver's cached route, used as the public start of the
// route line so the driver's exact home never leaves the server.
export function publicRouteStart(polyline: string | null, home: LatLng): LatLng {
  if (!polyline) return home;
  const path = decodePolyline(polyline);
  let km = 0;
  for (let i = 1; i < path.length; i++) {
    km += haversineKm(path[i - 1], path[i]);
    if (km >= 0.4) return path[i];
  }
  return path[path.length - 1] ?? home;
}
