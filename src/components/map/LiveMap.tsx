"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { APIProvider, InfoWindow, Map, Marker, Polyline, useApiIsLoaded, useMapsLibrary } from "@vis.gl/react-google-maps";
import { createClient } from "@/lib/supabase/client";
import { DEMO_DRIVERS, DEMO_MODE, DEMO_RIDERS, type MapDriver, type MapRider } from "@/lib/demo";
import { UBC_MAP_STYLE } from "@/lib/mapStyle";
import { distanceToPathKm, pointAlong, VANCOUVER_CENTER, type LatLng } from "@/lib/geo";
import { DRIVER_ICON, RIDER_ICON, SELF_ICON } from "./markers";
import Avatar from "@/components/Avatar";
import type { Role } from "@/lib/types";

type Me = { id: string; full_name: string; role: Role; photo_url: string | null; license_verified: boolean };

type PresenceUser = { user_id: string; role: Role; name: string; lat: number; lng: number };

const TICK_MS = 3000; // position update cadence
const STEP = 0.015; // fraction of route a driver advances per tick
const ON_ROUTE_KM = 1.5; // rider counts a driver as "on this route" within this distance
function icon(url: string, w: number, h: number, ax: number, ay: number): google.maps.Icon {
  return { url, scaledSize: new google.maps.Size(w, h), anchor: new google.maps.Point(ax, ay) };
}
const driverIcon = () => icon(DRIVER_ICON, 40, 40, 20, 20);
const riderIcon = () => icon(RIDER_ICON, 30, 40, 15, 38);
const selfIcon = () => icon(SELF_ICON, 36, 36, 18, 18);

const DEFAULT_RIDER_SPOT: LatLng = { lat: 49.2641, lng: -123.1605 }; // Broadway & Arbutus

export default function LiveMap({ me }: { me: Me }) {
  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      <LiveMapInner me={me} />
    </APIProvider>
  );
}

function LiveMapInner({ me }: { me: Me }) {
  const router = useRouter();
  const apiLoaded = useApiIsLoaded();
  const isDriver = me.role === "driver" || me.role === "both";
  const isRider = me.role === "rider" || me.role === "both";

  const [drivers, setDrivers] = useState<MapDriver[]>(DEMO_MODE ? DEMO_DRIVERS : []);
  const [riders, setRiders] = useState<MapRider[]>(DEMO_MODE ? DEMO_RIDERS : []);
  const [paths, setPaths] = useState<Record<string, LatLng[]>>({});
  const [tick, setTick] = useState(0);
  const [myPos, setMyPos] = useState<LatLng | null>(null);
  const [online, setOnline] = useState<PresenceUser[]>([]);
  const [selected, setSelected] = useState<{ pos: LatLng; title: string; sub: string } | null>(null);

  // --- Data: DB state + realtime refresh (skipped in demo mode) ---
  const load = useCallback(async () => {
    const res = await fetch("/api/map-state", { cache: "no-store" });
    if (!res.ok) return;
    const body = await res.json();
    setDrivers(body.drivers);
    setRiders(body.riders);
  }, []);

  useEffect(() => {
    if (DEMO_MODE) return;
    load();
    const supabase = createClient();
    const changes = supabase
      .channel("map-db")
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_requests" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(changes);
    };
  }, [load]);

  // --- Presence: every open map shares its live position ---
  const presenceRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  useEffect(() => {
    if (DEMO_MODE) return;
    const supabase = createClient();
    const channel = supabase.channel("map-presence", { config: { presence: { key: me.id } } });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        setOnline(Object.values(state).map((entries) => entries[0]).filter(Boolean));
      })
      .subscribe();
    presenceRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      presenceRef.current = null;
    };
  }, [me.id]);

  // --- My location (falls back to a Broadway spot for riders so the demo has context) ---
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // --- Timer: advance simulated drivers + re-broadcast my position ---
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ch = presenceRef.current;
    if (!ch || !myPos) return;
    ch.track({ user_id: me.id, role: me.role, name: me.full_name, lat: myPos.lat, lng: myPos.lng });
  }, [tick, myPos, me]);

  // --- Routes: pre-computed in demo mode, Directions API otherwise ---
  const routesLib = useMapsLibrary("routes");
  useEffect(() => {
    if (DEMO_MODE || !routesLib) return;
    const svc = new routesLib.DirectionsService();
    drivers
      .filter((d) => !d.path && !paths[d.id])
      .slice(0, 10)
      .forEach((d) => {
        svc
          .route({ origin: d.origin, destination: d.destination, travelMode: google.maps.TravelMode.DRIVING })
          .then((r) => {
            const path = r.routes[0]?.overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() }));
            if (path?.length) setPaths((prev) => ({ ...prev, [d.id]: path }));
          })
          .catch(() => setPaths((prev) => ({ ...prev, [d.id]: [d.origin, d.destination] })));
      });
  }, [routesLib, drivers, paths]);

  const driverPaths = useMemo(
    () => drivers.map((d) => ({ d, path: d.path ?? paths[d.id] ?? [d.origin, d.destination] })),
    [drivers, paths]
  );

  // Each driver starts at a different spot so the map doesn't look synchronized.
  const driverPositions = driverPaths.map(({ d, path }, i) => {
    const t = ((i * 0.23 + tick * STEP) % 0.9) + 0.05;
    return { d, path, pos: pointAlong(path, t) };
  });

  // Presence users who aren't already the current user.
  const others = online.filter((u) => u.user_id !== me.id);
  const riderSpot = myPos ?? DEFAULT_RIDER_SPOT;

  const activeCount = useMemo(() => {
    const ids = new Set<string>();
    drivers.forEach((d) => ids.add(d.driverId));
    riders.forEach((r) => ids.add(r.riderId));
    others.forEach((u) => ids.add(u.user_id));
    return ids.size;
  }, [drivers, riders, others]);

  const driversOnRoute = driverPaths.filter(({ path }) => distanceToPathKm(riderSpot, path) <= ON_ROUTE_KM).length;

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-paper">
      <Map
        defaultCenter={VANCOUVER_CENTER}
        defaultZoom={12}
        styles={UBC_MAP_STYLE}
        disableDefaultUI
        gestureHandling="greedy"
        clickableIcons={false}
        className="h-full w-full"
      >
        {apiLoaded && driverPositions.map(({ d, path }) => (
          <Polyline key={`line-${d.id}`} path={path} strokeColor="#002145" strokeOpacity={0.35} strokeWeight={4} />
        ))}

        {apiLoaded && driverPositions.map(({ d, pos }) => (
          <Marker
            key={d.id}
            position={pos}
            icon={driverIcon()}
            onClick={() => setSelected({ pos, title: d.name, sub: `${d.originLabel} → ${d.destinationLabel} · ${d.seats} seats` })}
          />
        ))}

        {apiLoaded && riders.map((r) => (
          <Marker
            key={r.id}
            position={r.pickup}
            icon={riderIcon()}
            onClick={() => setSelected({ pos: r.pickup, title: r.name, sub: `Pickup: ${r.pickupLabel}` })}
          />
        ))}

        {apiLoaded && others.map((u) => (
          <Marker
            key={`p-${u.user_id}`}
            position={{ lat: u.lat, lng: u.lng }}
            icon={u.role === "rider" ? riderIcon() : driverIcon()}
            onClick={() => setSelected({ pos: { lat: u.lat, lng: u.lng }, title: u.name, sub: "Live now" })}
          />
        ))}

        {apiLoaded && myPos && (
          <Marker
            position={myPos}
            icon={selfIcon()}
            zIndex={1000}
          />
        )}

        {selected && (
          <InfoWindow position={selected.pos} onCloseClick={() => setSelected(null)} headerDisabled>
            <div className="pr-2 font-sans">
              <p className="font-heading font-semibold text-ink">{selected.title}</p>
              <p className="text-xs text-muted">{selected.sub}</p>
            </div>
          </InfoWindow>
        )}
      </Map>

      {/* Top overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto flex max-w-app items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto card px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green" />
            </span>
            <p className="font-heading font-semibold text-ink">
              {activeCount} {activeCount === 1 ? "person" : "people"} active nearby
            </p>
          </div>
          {isRider && (
            <p className="mt-0.5 pl-[18px] text-sm text-muted">
              {driversOnRoute} {driversOnRoute === 1 ? "driver" : "drivers"} active on this route
            </p>
          )}
          {DEMO_MODE && <p className="mt-1 pl-[18px] text-xs font-semibold text-blue">Demo mode</p>}
        </div>
        <button onClick={signOut} className="pointer-events-auto" title="Sign out">
          <Avatar name={me.full_name} photoUrl={me.photo_url} size={44} tone={isDriver ? "driver" : "rider"} />
        </button>
      </div>

      {/* Bottom sheet */}
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-app p-4">
        <div className="rounded-card border border-line bg-white p-5 shadow-lift">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
          <p className="text-sm text-muted">Hi {me.full_name.split(" ")[0]} 👋</p>
          <h2 className="mt-0.5 text-xl font-bold text-ubc">
            {isDriver && !isRider ? "Heading to campus?" : "Where are you headed?"}
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            {isRider && (
              <Link href="/request" className="btn-sky w-full">
                Request a ride
              </Link>
            )}
            {isDriver && !me.license_verified && (
              <Link href="/driver-verify" className="btn-ghost w-full">
                Verify your license
              </Link>
            )}
            {isDriver && (
              <Link href="/driver" className="btn-ubc w-full">
                Go online / see requests
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
