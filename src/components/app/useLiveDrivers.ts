"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { createClient } from "@/lib/supabase/client";
import { DEMO_DRIVERS, DEMO_MODE, DEMO_RIDERS, type MapDriver, type MapRider } from "@/lib/demo";
import { pointAlong, type LatLng } from "@/lib/geo";
import { usePresence, useTick, type PresenceUser } from "./hooks";
import type { Role } from "@/lib/types";

export type LiveDriver = {
  driverId: string;
  name: string;
  faculty: string | null;
  pos: LatLng;
  live: boolean; // true = real GPS from an open app, false = simulated along their route
  rideId: string | null;
  path: LatLng[] | null;
};

const STEP = 0.012;

// Everyone on the map: posted rides (animated along their route) merged with
// real positions from anyone who has the app open.
export function useLiveDrivers(me: { id: string; role: Role; full_name: string }, myPos: LatLng | null) {
  const [rides, setRides] = useState<MapDriver[]>(DEMO_MODE ? DEMO_DRIVERS : []);
  const [riders, setRiders] = useState<MapRider[]>(DEMO_MODE ? DEMO_RIDERS : []);
  const [paths, setPaths] = useState<Record<string, LatLng[]>>({});
  const tick = useTick(3000);
  const online = usePresence("map-presence", me, myPos);

  const load = useCallback(async () => {
    const res = await fetch("/api/map-state", { cache: "no-store" });
    if (!res.ok) return;
    const body = await res.json();
    setRides(body.drivers);
    setRiders(body.riders);
  }, []);

  useEffect(() => {
    if (DEMO_MODE) return;
    load();
    const supabase = createClient();
    const ch = supabase
      .channel(`map-db-${me.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_requests" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, me.id]);

  const routesLib = useMapsLibrary("routes");
  useEffect(() => {
    if (DEMO_MODE || !routesLib) return;
    const svc = new routesLib.DirectionsService();
    rides
      .filter((d) => !d.path && !paths[d.id])
      .slice(0, 10)
      .forEach((d) => {
        setPaths((prev) => ({ ...prev, [d.id]: [d.origin, d.destination] })); // placeholder, avoids refetch
        svc
          .route({ origin: d.origin, destination: d.destination, travelMode: google.maps.TravelMode.DRIVING })
          .then((r) => {
            const path = r.routes[0]?.overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() }));
            if (path?.length) setPaths((prev) => ({ ...prev, [d.id]: path }));
          })
          .catch(() => {});
      });
  }, [routesLib, rides, paths]);

  const drivers: LiveDriver[] = useMemo(() => {
    const byId = new Map<string, PresenceUser>(online.map((u) => [u.user_id, u]));
    // One marker per driver even if they posted more than one ride.
    const seen = new Set<string>();
    const list: LiveDriver[] = rides
      .filter((d) => d.driverId !== me.id && !seen.has(d.driverId) && !!seen.add(d.driverId))
      .map((d, i) => {
        const path = d.path ?? paths[d.id] ?? [d.origin, d.destination];
        const live = byId.get(d.driverId);
        const t = ((i * 0.23 + tick * STEP) % 0.9) + 0.05;
        return {
          driverId: d.driverId,
          name: d.name,
          faculty: d.faculty,
          pos: live ? { lat: live.lat, lng: live.lng } : pointAlong(path, t),
          live: !!live,
          rideId: d.id,
          path,
        };
      });
    // Drivers with the app open but not posted yet.
    online
      .filter((u) => (u.role === "driver" || u.role === "both") && !list.some((d) => d.driverId === u.user_id))
      .forEach((u) =>
        list.push({ driverId: u.user_id, name: u.name, faculty: null, pos: { lat: u.lat, lng: u.lng }, live: true, rideId: null, path: null })
      );
    return list;
  }, [rides, paths, online, tick, me.id]);

  const liveRiders = online.filter((u) => u.role === "rider");

  return { drivers, riders, liveRiders, online, reload: load };
}
