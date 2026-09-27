"use client";

import { useEffect } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import type { LatLng } from "@/lib/geo";

// The real drive: start → each pickup in order → campus, following roads.
const cache = new Map<string, { path: google.maps.LatLng[]; legs: number[] }>();

// onLegs gets each leg's driving time in minutes (start → stop 1 → … → end).
export default function PodRouteLine({
  start,
  stops,
  end,
  color = "#0055B7",
  onLegs,
}: {
  start: LatLng;
  stops: LatLng[];
  end: LatLng;
  color?: string;
  onLegs?: (minutes: number[]) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary("routes");
  const key = [start, ...stops, end].map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");

  useEffect(() => {
    if (!map || !routesLib) return;
    let line: google.maps.Polyline | null = null;
    let cancelled = false;
    const draw = (path: google.maps.LatLng[] | LatLng[]) => {
      if (cancelled) return;
      line = new google.maps.Polyline({ path, strokeColor: color, strokeOpacity: 0.9, strokeWeight: 5, map });
    };
    const hit = cache.get(key);
    if (hit) {
      draw(hit.path);
      onLegs?.(hit.legs);
    }
    else
      new routesLib.DirectionsService()
        .route({
          origin: start,
          destination: end,
          waypoints: stops.map((s) => ({ location: s, stopover: true })),
          optimizeWaypoints: false,
          travelMode: google.maps.TravelMode.DRIVING,
        })
        .then((r) => {
          const path = r.routes[0]?.overview_path ?? [];
          const legs = (r.routes[0]?.legs ?? []).map((l) => Math.round((l.duration?.value ?? 0) / 60));
          cache.set(key, { path, legs });
          draw(path);
          if (!cancelled) onLegs?.(legs);
        })
        .catch(() => draw([start, ...stops, end]));
    return () => {
      cancelled = true;
      line?.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routesLib, key, color]);

  return null;
}
