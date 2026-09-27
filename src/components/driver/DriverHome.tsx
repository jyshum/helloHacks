"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { ChevronRight, GraduationCap } from "lucide-react";
import BaseMap from "@/components/app/BaseMap";
import ProfileMenu, { type MenuUser } from "@/components/app/ProfileMenu";
import { useMyLocation } from "@/components/app/hooks";
import { useLiveDrivers } from "@/components/app/useLiveDrivers";
import Avatar from "@/components/Avatar";
import SharedBadge from "@/components/SharedBadge";
import { CAMPUS_SPOTS, PICKUP_SPOTS, type Place } from "@/lib/places";
import { formatCents } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/client";
import type { LatLng } from "@/lib/geo";
import type { Ride, RideRequest, User } from "@/lib/types";

type Rider = Pick<User, "id" | "full_name" | "faculty" | "year" | "photo_url" | "rating_avg" | "rating_count">;
type Req = RideRequest & { rider: Rider | null };

export type DriverMe = MenuUser & { faculty: string | null; year: number | null; seatCapacity: number };

export default function DriverHome({ me, onSwitchMode }: { me: DriverMe; onSwitchMode?: () => void }) {
  const router = useRouter();
  const myPos = useMyLocation();
  const [ride, setRide] = useState<Ride | null>(null);
  // Broadcast as a driver (the mode, not the account role), and only while online.
  const { riders } = useLiveDrivers({ ...me, role: "driver" }, myPos, !!ride);
  const [requests, setRequests] = useState<Req[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [firstFix, setFirstFix] = useState<LatLng | null>(null);
  useEffect(() => {
    if (myPos && !firstFix) setFirstFix(myPos);
  }, [myPos, firstFix]);

  const load = useCallback(async () => {
    const res = await fetch("/api/driver/state", { cache: "no-store" });
    if (!res.ok) return;
    const body = await res.json();
    setRide(body.ride);
    setRequests(body.requests);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    const ch = supabase
      .channel(`driver-${me.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_requests" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, me.id]);

  const accepted = requests.find((r) => r.status === "accepted");
  const pending = requests.filter((r) => r.status === "pending");

  async function goOnline(dest: Place, origin: Place) {
    setBusy("online");
    setError(null);
    const res = await fetch("/api/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: { lat: origin.lat, lng: origin.lng },
        origin_label: origin.label,
        destination: { lat: dest.lat, lng: dest.lng },
        destination_label: dest.label,
        departure_time: new Date().toISOString(),
        seats_available: me.seatCapacity,
      }),
    });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) return setError(body.error);
    setPicking(false);
    load();
  }

  async function goOffline() {
    if (!ride) return;
    setBusy("offline");
    await fetch(`/api/rides/${ride.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    setBusy(null);
    load();
  }

  async function act(id: string, action: "accept" | "decline") {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/ride-requests/${id}/${action}`, { method: "POST" });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) return setError(body.error);
    if (action === "accept") router.push(`/match/${id}`);
    else load();
  }

  const online = !!ride;
  const origin = ride ? { lat: ride.origin_lat, lng: ride.origin_lng } : null;
  const dest = ride ? { lat: ride.destination_lat, lng: ride.destination_lng } : null;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-paper">
      <BaseMap
        me={myPos}
        pins={[
          ...(online
            ? requests.map((r) => ({ id: r.id, pos: { lat: r.pickup_lat, lng: r.pickup_lng }, kind: "pickup" as const }))
            : riders.map((r) => ({ id: r.id, pos: r.pickup, kind: "rider" as const }))),
          ...(dest ? [{ id: "dest", pos: dest, kind: "dropoff" as const }] : []),
        ]}
        fit={online && origin && dest ? [origin, dest] : firstFix ? [firstFix] : null}
        bottomPadding={online ? 380 : 260}
      >
        {online && origin && dest && <DriveRoute from={origin} to={dest} />}
      </BaseMap>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto flex max-w-app items-center justify-between p-4">
        <ProfileMenu me={me} mode="driver" onSwitchMode={onSwitchMode} />
        <span
          className={`pointer-events-auto rounded-full px-4 py-2 font-heading text-sm font-semibold shadow-lift ${
            online ? "bg-green text-white" : "bg-white text-ink"
          }`}
        >
          <span className="flex items-center gap-1.5">
            {online && <span className="h-2 w-2 rounded-full bg-white" />}
            {online ? "Online" : "Offline"}
          </span>
        </span>
      </div>

      {!loaded ? null : !online ? (
        <>
          {!picking && (
            <button
              onClick={() => setPicking(true)}
              className="absolute bottom-[190px] left-1/2 z-20 flex h-24 w-24 -translate-x-1/2 items-center justify-center rounded-full border-4 border-white bg-blue font-heading text-3xl font-bold text-white shadow-lift transition active:scale-95"
            >
              GO
            </button>
          )}
          <div className="sheet">
            <div className="sheet-handle" />
            {picking ? (
              <GoOnlinePicker myPos={myPos} busy={busy === "online"} onCancel={() => setPicking(false)} onConfirm={goOnline} />
            ) : (
              <>
                <h2 className="text-center font-heading text-xl font-bold text-ink">You&apos;re offline</h2>
                <p className="mt-1 text-center text-sm text-muted">Tap GO to pick up riders on your way.</p>
                {!me.license_verified && (
                  <Link href="/driver-verify" className="mt-4 flex items-center justify-between rounded-2xl bg-frost px-4 py-3 text-sm">
                    <span className="font-semibold text-ubc">Verify your license so riders trust you</span>
                    <ChevronRight size={18} className="text-ubc" aria-hidden />
                  </Link>
                )}
              </>
            )}
            {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
          </div>
        </>
      ) : (
        <div className="sheet max-h-[60dvh] overflow-y-auto">
          <div className="sheet-handle" />
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted">Heading to</p>
              <p className="truncate font-heading text-lg font-bold text-ink">{ride.destination_label}</p>
            </div>
            <button onClick={goOffline} disabled={busy === "offline" || !!accepted} className="btn-ghost px-4 py-2 text-sm">
              Go offline
            </button>
          </div>

          {accepted && (
            <Link href={`/match/${accepted.id}`} className="mt-4 flex items-center gap-3 rounded-2xl bg-ubc p-4 text-white">
              <Avatar name={accepted.rider?.full_name} photoUrl={accepted.rider?.photo_url} tone="rider" size={44} />
              <span className="flex-1">
                <span className="block text-xs text-white/70">Current trip</span>
                <span className="font-heading font-semibold">Pick up {accepted.rider?.full_name}</span>
                <span className="block text-xs text-white/70">{accepted.pickup_label}</span>
              </span>
              <ChevronRight size={20} aria-hidden />
            </Link>
          )}

          {pending.length === 0 && !accepted && (
            <div className="mt-6 flex flex-col items-center py-4 text-center">
              <span className="relative flex h-4 w-4">
                <span className="absolute h-full w-full animate-ping rounded-full bg-blue/50" />
                <span className="relative h-4 w-4 rounded-full bg-blue" />
              </span>
              <p className="mt-4 font-heading font-semibold text-ink">Finding riders on your route…</p>
              <p className="text-sm text-muted">Requests pop up here instantly.</p>
            </div>
          )}

          {pending.map((r) => (
            <div key={r.id} className="mt-4 rounded-2xl border border-line p-4 shadow-soft">
              <div className="flex items-center gap-3">
                <Link href={`/profile/${r.rider_id}`}>
                  <Avatar name={r.rider?.full_name} photoUrl={r.rider?.photo_url} tone="rider" size={52} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/profile/${r.rider_id}`} className="font-heading font-semibold text-ink">
                    {r.rider?.full_name}
                  </Link>
                  <p className="text-sm text-muted">
                    ★ {Number(r.rider?.rating_avg ?? 5).toFixed(1)}
                    {r.rider?.faculty ? ` · ${r.rider.faculty}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-heading text-lg font-bold text-ink">{r.estimated_cost_cents != null ? formatCents(r.estimated_cost_cents) : "–"}</p>
                  <p className="text-[11px] text-muted">gas</p>
                </div>
              </div>
              {r.rider && (
                <div className="mt-2">
                  <SharedBadge a={me} b={r.rider} />
                </div>
              )}
              <div className="mt-3 space-y-1 text-sm">
                <p className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ink" /> {r.pickup_label}</p>
                <p className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 bg-ink" /> {r.dropoff_label}</p>
                <p className="text-xs text-muted">+{r.detour_minutes} min detour · {r.detour_km} km</p>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
                <button onClick={() => act(r.id, "decline")} disabled={busy === r.id} className="btn-ghost">Decline</button>
                <button onClick={() => act(r.id, "accept")} disabled={busy === r.id} className="btn-ubc">Accept</button>
              </div>
            </div>
          ))}
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}

function GoOnlinePicker({
  myPos,
  busy,
  onCancel,
  onConfirm,
}: {
  myPos: LatLng | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (dest: Place, origin: Place) => void;
}) {
  const [dest, setDest] = useState<Place>(CAMPUS_SPOTS[0]);
  const [originLabel, setOriginLabel] = useState(myPos ? "Current location" : PICKUP_SPOTS[0].label);
  const origin: Place | undefined =
    originLabel === "Current location" && myPos
      ? { label: "Current location", ...myPos }
      : PICKUP_SPOTS.concat(CAMPUS_SPOTS).find((p) => p.label === originLabel);

  return (
    <div>
      <h2 className="font-heading text-xl font-bold text-ink">Where are you heading?</h2>
      <div className="mt-3 flex flex-col gap-1">
        {CAMPUS_SPOTS.map((p) => (
          <button
            key={p.label}
            onClick={() => setDest(p)}
            className={`row rounded-2xl px-3 ${dest.label === p.label ? "bg-frost ring-2 ring-ubc" : ""}`}
          >
            <span className="row-icon"><GraduationCap size={18} aria-hidden /></span>
            <span className="font-medium text-ink">{p.label}</span>
          </button>
        ))}
      </div>
      <label className="label mt-4" htmlFor="origin">Starting from</label>
      <select id="origin" className="input" value={originLabel} onChange={(e) => setOriginLabel(e.target.value)}>
        {myPos && <option>Current location</option>}
        {PICKUP_SPOTS.concat(CAMPUS_SPOTS).map((p) => <option key={p.label}>{p.label}</option>)}
      </select>
      <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2">
        <button onClick={onCancel} className="btn-ghost">Cancel</button>
        <button onClick={() => origin && onConfirm(dest, origin)} disabled={!origin || busy} className="btn-ubc">
          {busy ? "Going online…" : "Go online"}
        </button>
      </div>
    </div>
  );
}

function DriveRoute({ from, to }: { from: LatLng; to: LatLng }) {
  const map = useMap();
  const routesLib = useMapsLibrary("routes");
  useEffect(() => {
    if (!map || !routesLib) return;
    let line: google.maps.Polyline | null = null;
    let cancelled = false;
    new routesLib.DirectionsService()
      .route({ origin: from, destination: to, travelMode: google.maps.TravelMode.DRIVING })
      .then((r) => {
        if (cancelled) return;
        line = new google.maps.Polyline({ path: r.routes[0]?.overview_path, strokeColor: "#0055B7", strokeWeight: 5, map });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      line?.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routesLib, from.lat, from.lng, to.lat, to.lng]);
  return null;
}
