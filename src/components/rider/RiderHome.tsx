"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import BaseMap from "@/components/app/BaseMap";
import ProfileMenu, { type MenuUser } from "@/components/app/ProfileMenu";
import { useMyLocation } from "@/components/app/hooks";
import { useLiveDrivers } from "@/components/app/useLiveDrivers";
import LocationSearch from "./LocationSearch";
import Avatar from "@/components/Avatar";
import { CAMPUS_SPOTS, type Place } from "@/lib/places";
import { etaMinutes, haversineKm, UBC, type LatLng } from "@/lib/geo";
import { formatCents, PRICING_FORMULA } from "@/lib/pricing";
import { MAX_DETOUR_MINUTES } from "@/lib/matching";
import { DEMO_MODE } from "@/lib/demo";
import type { RideOption } from "@/lib/quote";

type Stage = "home" | "search" | "pin" | "choose";
type Field = "pickup" | "dropoff";

const NEARBY_KM = 8;

export default function RiderHome({ me, onSwitchMode }: { me: MenuUser; onSwitchMode?: () => void }) {
  const router = useRouter();
  const myPos = useMyLocation();
  // Broadcast the mode, not the account role, so nearby drivers see me as a rider.
  const { drivers } = useLiveDrivers({ ...me, role: "rider" }, myPos);

  const [stage, setStage] = useState<Stage>("home");
  const [field, setField] = useState<Field>("dropoff");
  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [activeTrip, setActiveTrip] = useState<{ requestId: string; status: string; otherName: string } | null>(null);

  // Default pickup to GPS once it arrives, and centre on it once (not on every GPS tick).
  const [firstFix, setFirstFix] = useState<LatLng | null>(null);
  useEffect(() => {
    if (myPos && !firstFix) setFirstFix(myPos);
    if (myPos && !pickup) setPickup({ label: "Current location", ...myPos });
  }, [myPos, pickup, firstFix]);

  useEffect(() => {
    fetch("/api/trips/active", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setActiveTrip(b.trip?.role === "rider" ? b.trip : null))
      .catch(() => {});
  }, []);

  const center = myPos ?? pickup ?? UBC;
  const nearby = useMemo(
    () =>
      drivers
        .map((d) => ({ ...d, km: haversineKm(center, d.pos) }))
        .filter((d) => d.km <= NEARBY_KM)
        .sort((a, b) => a.km - b.km),
    [drivers, center]
  );

  function pick(f: Field, place: Place) {
    const nextPickup = f === "pickup" ? place : pickup;
    const nextDrop = f === "dropoff" ? place : dropoff;
    if (f === "pickup") setPickup(place);
    else setDropoff(place);
    if (nextPickup && nextDrop) setStage("choose");
  }

  function quickDestination(place: Place) {
    setDropoff(place);
    if (pickup) setStage("choose");
    else {
      setField("pickup");
      setStage("search");
    }
  }

  function confirmPin() {
    const c = map?.getCenter();
    if (!c) return;
    const place = { label: "Pinned location", lat: c.lat(), lng: c.lng() };
    const nextPickup = field === "pickup" ? place : pickup;
    const nextDrop = field === "dropoff" ? place : dropoff;
    if (field === "pickup") setPickup(place);
    else setDropoff(place);
    setStage(nextPickup && nextDrop ? "choose" : "search");
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-paper">
      <BaseMap
        me={myPos}
        cars={stage === "pin" ? [] : nearby.map((d) => ({ id: d.driverId, pos: d.pos, onClick: () => router.push(`/profile/${d.driverId}`) }))}
        pins={
          stage === "choose" && pickup && dropoff
            ? [
                { id: "pu", pos: pickup, kind: "pickup" },
                { id: "do", pos: dropoff, kind: "dropoff" },
              ]
            : []
        }
        fit={stage === "choose" && pickup && dropoff ? [pickup, dropoff] : stage === "home" && firstFix ? [firstFix] : null}
        bottomPadding={stage === "choose" ? 420 : 300}
      >
        <MapGrabber onMap={setMap} />
        {stage === "choose" && pickup && dropoff && <TripRoute from={pickup} to={dropoff} />}
      </BaseMap>

      {/* Top bar */}
      {stage !== "pin" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto flex max-w-app items-center justify-between p-4">
          <ProfileMenu me={me} mode="rider" onSwitchMode={onSwitchMode} />
          {DEMO_MODE && <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue shadow-soft">Demo mode</span>}
        </div>
      )}

      {stage === "home" && (
        <div className="sheet">
          <div className="sheet-handle" />
          {activeTrip && (
            <Link href={`/match/${activeTrip.requestId}`} className="mb-4 flex items-center justify-between rounded-2xl bg-ubc px-4 py-3 text-white">
              <span>
                <span className="block text-xs text-white/70">{activeTrip.status === "pending" ? "Request sent" : "Trip confirmed"}</span>
                <span className="font-heading font-semibold">Your ride with {activeTrip.otherName}</span>
              </span>
              <span>→</span>
            </Link>
          )}
          <h2 className="font-heading text-2xl font-bold text-ink">Hi {me.full_name.split(" ")[0]}</h2>

          <button
            onClick={() => {
              setField("dropoff");
              setStage("search");
            }}
            className="mt-3 flex w-full items-center gap-3 rounded-full bg-paper px-5 py-4 text-left"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0B1B2E" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <span className="flex-1 font-heading text-lg font-semibold text-ink">Where to?</span>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-ink shadow-soft">Now</span>
          </button>

          <NearbyStrip nearby={nearby} center={center} />

          <div className="mt-2 divide-y divide-line">
            {CAMPUS_SPOTS.slice(0, 3).map((p) => (
              <button key={p.label} onClick={() => quickDestination(p)} className="row">
                <span className="row-icon">🎓</span>
                <span>
                  <span className="block font-medium text-ink">{p.label}</span>
                  <span className="block text-sm text-muted">UBC campus</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {stage === "search" && (
        <LocationSearch
          pickup={pickup}
          dropoff={dropoff}
          initialField={field}
          myPos={myPos}
          onPick={pick}
          onPinMode={(f) => {
            setField(f);
            setStage("pin");
          }}
          onClose={() => setStage("home")}
        />
      )}

      {stage === "pin" && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full">
            <svg width="36" height="48" viewBox="0 0 30 40"><path d="M15 38s12-11 12-22A12 12 0 1 0 3 16c0 11 12 22 12 22z" fill="#002145" stroke="#fff" strokeWidth="2.5" /><circle cx="15" cy="16" r="4.5" fill="#fff" /></svg>
          </div>
          <div className="absolute inset-x-0 top-0 z-10 mx-auto max-w-app p-4">
            <button onClick={() => setStage("search")} className="rounded-full bg-white px-4 py-2 font-semibold shadow-lift">← Back</button>
          </div>
          <div className="sheet">
            <div className="sheet-handle" />
            <h2 className="font-heading text-xl font-bold">Set your {field === "pickup" ? "pickup" : "destination"}</h2>
            <p className="mt-1 text-sm text-muted">Drag the map to move the pin.</p>
            <button onClick={confirmPin} className="btn-ubc mt-4 w-full">Confirm {field === "pickup" ? "pickup" : "destination"}</button>
          </div>
        </>
      )}

      {stage === "choose" && pickup && dropoff && (
        <ChooseRide
          pickup={pickup}
          dropoff={dropoff}
          livePositions={Object.fromEntries(drivers.filter((d) => d.live).map((d) => [d.driverId, d.pos]))}
          onBack={() => setStage("search")}
          onRequested={(id) => router.push(`/match/${id}`)}
        />
      )}
    </div>
  );
}

function NearbyStrip({ nearby, center }: { nearby: { driverId: string; name: string; pos: LatLng; live: boolean }[]; center: LatLng }) {
  if (!nearby.length) {
    return <p className="mt-4 rounded-2xl bg-paper px-4 py-3 text-sm text-muted">No drivers nearby right now. Check back in a few minutes.</p>;
  }
  const closest = etaMinutes(center, nearby[0].pos);
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between">
        <p className="font-heading font-semibold text-ink">
          {nearby.length} {nearby.length === 1 ? "driver" : "drivers"} nearby
        </p>
        <p className="text-sm text-muted">closest {closest} min</p>
      </div>
      <div className="no-scrollbar -mx-1 mt-2 flex gap-3 overflow-x-auto px-1 pb-1">
        {nearby.slice(0, 8).map((d) => (
          <Link key={d.driverId} href={`/profile/${d.driverId}`} className="flex w-16 shrink-0 flex-col items-center">
            <span className="relative">
              <Avatar name={d.name} size={48} />
              {d.live && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green" />}
            </span>
            <span className="mt-1 w-full truncate text-center text-xs text-ink">{d.name.split(" ")[0]}</span>
            <span className="text-[11px] text-muted">{etaMinutes(center, d.pos)} min</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ChooseRide({
  pickup,
  dropoff,
  livePositions,
  onBack,
  onRequested,
}: {
  pickup: Place;
  dropoff: Place;
  livePositions: Record<string, LatLng>;
  onBack: () => void;
  onRequested: (requestId: string) => void;
}) {
  const [options, setOptions] = useState<RideOption[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setOptions(null);
    setError(null);
    fetch("/api/rides/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pickup: { lat: pickup.lat, lng: pickup.lng } }),
    })
      .then((r) => r.json())
      .then((b) => {
        if (cancelled) return;
        const opts: RideOption[] = b.options ?? [];
        setOptions(opts);
        setSelected(opts.find((o) => o.valid)?.rideId ?? null);
      })
      .catch(() => !cancelled && setError("Couldn't load drivers."));
    return () => {
      cancelled = true;
    };
  }, [pickup.lat, pickup.lng]);

  const chosen = options?.find((o) => o.rideId === selected) ?? null;

  async function request() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/ride-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ride_id: chosen.rideId,
        pickup: { lat: pickup.lat, lng: pickup.lng },
        pickup_label: pickup.label,
        dropoff: { lat: dropoff.lat, lng: dropoff.lng },
        dropoff_label: dropoff.label,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setError(body.error);
    }
    onRequested(body.request.id);
  }

  return (
    <>
      <div className="absolute inset-x-0 top-0 z-10 mx-auto max-w-app p-4">
        <button onClick={onBack} className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-lift">
          <span className="text-lg">←</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-muted">{pickup.label}</span>
            <span className="block truncate font-semibold text-ink">{dropoff.label}</span>
          </span>
        </button>
      </div>

      <div className="sheet max-h-[62dvh] overflow-y-auto">
        <div className="sheet-handle" />
        <h2 className="font-heading text-xl font-bold text-ink">Choose a driver</h2>

        {!options && !error && <p className="py-8 text-center text-muted">Finding drivers on your route…</p>}
        {options?.length === 0 && (
          <p className="py-8 text-center text-muted">No drivers heading your way right now. Try again in a few minutes.</p>
        )}

        <div className="mt-2 flex flex-col gap-2">
          {options?.map((o) => {
            const from = livePositions[o.driverId] ?? o.origin;
            const eta = etaMinutes(from, pickup);
            const isSel = o.rideId === selected;
            return (
              <div
                key={o.rideId}
                onClick={() => o.valid && setSelected(o.rideId)}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 transition ${
                  isSel ? "border-ubc bg-frost" : "border-transparent"
                } ${o.valid ? "" : "cursor-not-allowed opacity-45"}`}
              >
                <Link href={`/profile/${o.driverId}`} onClick={(e) => e.stopPropagation()} className="relative shrink-0">
                  <Avatar name={o.driverName} photoUrl={o.driverPhoto} size={52} />
                  {livePositions[o.driverId] && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-green" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-heading font-semibold text-ink">{o.driverName}</p>
                    <span className="shrink-0 text-xs text-muted">★ {o.driverRating.toFixed(1)}</span>
                    {o.licenseVerified && <span className="shrink-0 text-xs text-green" title="License verified">✓</span>}
                  </div>
                  <p className="truncate text-sm text-muted">
                    {o.vehicle ? `${o.vehicle.color} ${o.vehicle.make_model}` : o.driverFaculty ?? "UBC student"}
                  </p>
                  <p className="text-xs text-muted">
                    {o.valid ? `${eta} min away · +${o.detourMinutes} min detour` : `Too far off route (+${o.detourMinutes} min, max ${MAX_DETOUR_MINUTES})`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-heading text-lg font-bold text-ink">{formatCents(o.estimatedCostCents)}</p>
                  <p className="text-[11px] text-muted">gas</p>
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {options && options.length > 0 && (
          <div className="sticky bottom-0 -mx-5 mt-3 bg-white px-5 pt-2">
            <button onClick={request} disabled={!chosen || busy} className="btn-ubc w-full py-4 text-lg">
              {busy ? "Requesting…" : chosen ? `Request ${chosen.driverName.split(" ")[0]} · ${formatCents(chosen.estimatedCostCents)}` : "Pick a driver"}
            </button>
            <p className="mt-2 text-center text-[11px] text-muted">Gas contribution only · {PRICING_FORMULA}</p>
          </div>
        )}
      </div>
    </>
  );
}

function MapGrabber({ onMap }: { onMap: (m: google.maps.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    if (map) onMap(map);
  }, [map, onMap]);
  return null;
}

// Draws the pickup → destination route in bold UBC blue.
function TripRoute({ from, to }: { from: LatLng; to: LatLng }) {
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
        line = new google.maps.Polyline({
          path: r.routes[0]?.overview_path ?? [from, to],
          strokeColor: "#0B1B2E",
          strokeWeight: 5,
          map,
        });
      })
      .catch(() => {
        if (cancelled) return;
        line = new google.maps.Polyline({ path: [from, to], strokeColor: "#0B1B2E", strokeWeight: 4, map });
      });
    return () => {
      cancelled = true;
      line?.setMap(null);
    };
  }, [map, routesLib, from, to]);
  return null;
}
