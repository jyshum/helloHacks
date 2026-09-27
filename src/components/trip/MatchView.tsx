"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { APIProvider } from "@vis.gl/react-google-maps";
import { BadgeCheck, Check, ChevronDown, ChevronUp, Mail, MapPin, Navigation, ShieldCheck, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BaseMap from "@/components/app/BaseMap";
import BackButton from "@/components/app/BackButton";
import { useMyLocation, usePresence } from "@/components/app/hooks";
import Avatar from "@/components/Avatar";
import SharedBadge from "@/components/SharedBadge";
import FareBreakdown from "./FareBreakdown";
import { etaMinutes, haversineKm, type LatLng } from "@/lib/geo";
import { fareBetween, formatCents } from "@/lib/pricing";
import { prettyTime } from "@/lib/pods/time";
import type { TripBundle } from "@/lib/trip";

type Viewer = "driver" | "rider";

const HERE_KM = 0.12; // driver counts as "here" within ~120 m of a pickup
const ARRIVED_KM = 0.25; // trip ends itself within ~250 m of the drop-off

const first = (n: string) => n.split(" ")[0];

export default function MatchView(props: { trip: TripBundle; viewer: Viewer }) {
  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      <TripScreen {...props} />
    </APIProvider>
  );
}

function TripScreen({ trip, viewer }: { trip: TripBundle; viewer: Viewer }) {
  const router = useRouter();
  const { request, ride, driver, rider, vehicle, stops } = trip;
  const meUser = viewer === "driver" ? driver : rider;
  const other = viewer === "driver" ? rider : driver;
  const myPos = useMyLocation();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showCost, setShowCost] = useState(false);

  // Everyone on this ride shares live GPS on one channel (pods can have several riders).
  const live = usePresence(`ride-${ride.id}`, { id: meUser.id, role: viewer, full_name: meUser.full_name, photo_url: meUser.photo_url }, myPos, 2500);
  const driverPos: LatLng | null = viewer === "driver" ? myPos : live.find((u) => u.user_id === driver.id) ?? null;
  const livePos = (userId: string): LatLng | null => {
    const u = live.find((x) => x.user_id === userId);
    return u ? { lat: u.lat, lng: u.lng } : null;
  };

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`match-${ride.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ride_requests", filter: `ride_id=eq.${ride.id}` }, () => router.refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${ride.id}` }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [ride.id, router]);

  const dropoff = { lat: request.dropoff_lat, lng: request.dropoff_lng };
  const campus = request.dropoff_label ?? "campus";
  const done = ride.status === "completed" || request.status === "completed";
  const ended = request.status === "declined" || request.status === "cancelled";
  const pending = request.status === "pending";

  // Pickup progress.
  const nextStop = stops.find((s) => !s.pickedUp) ?? null;
  const allPickedUp = stops.length > 0 && !nextStop;
  const myStop = stops.find((s) => s.requestId === request.id) ?? null;
  const iAmIn = viewer === "rider" && (!!request.picked_up_at || (!myStop && ride.status === "active"));
  const ahead = viewer === "rider" && myStop ? stops.slice(0, stops.indexOf(myStop)).filter((s) => !s.pickedUp) : [];
  const myPickup = { lat: request.pickup_lat, lng: request.pickup_lng };
  const driverHereForMe = viewer === "rider" && !iAmIn && driverPos && haversineKm(driverPos, myPickup) <= HERE_KM;
  const driverAtNext = viewer === "driver" && nextStop && myPos && haversineKm(myPos, nextStop.pickup) <= HERE_KM;
  const nearCampus = !!driverPos && haversineKm(driverPos, dropoff) <= ARRIVED_KM;

  async function post(url: string, body?: object) {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setNote((await res.json().catch(() => ({}))).error ?? "Something went wrong.");
      return false;
    }
    return true;
  }

  const rateUrl = `/trip/${ride.id}/complete?request=${request.id}`;

  // Arriving on campus ends the trip by itself (driver's phone is the source of truth).
  const autoEnded = useRef(false);
  useEffect(() => {
    if (viewer !== "driver" || done || autoEnded.current || !allPickedUp || !nearCampus) return;
    autoEnded.current = true;
    void post(`/api/rides/${ride.id}/status`, { status: "completed" }).then((ok) => ok && router.push(rateUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, done, allPickedUp, nearCampus]);

  async function share() {
    const text = `I'm riding to ${campus} with ${driver.full_name}${vehicle ? ` in a ${vehicle.color} ${vehicle.make_model} (${vehicle.license_plate})` : ""}. Pickup: ${request.pickup_label}.`;
    try {
      if (navigator.share) await navigator.share({ title: "My Hopped ride", text });
      else {
        await navigator.clipboard.writeText(text);
        setNote("Copied.");
      }
    } catch {}
  }

  // Headline, Uber style.
  const d = first(driver.full_name);
  let title = "";
  let subtitle = "";
  let tone: "normal" | "here" = "normal";
  if (ended) {
    title = request.status === "declined" ? `${d} can't take this ride` : "Ride cancelled";
  } else if (done || (viewer === "rider" && iAmIn && nearCampus)) {
    title = "You've arrived";
    subtitle = campus;
  } else if (pending) {
    title = viewer === "rider" ? `Waiting for ${d}` : `${first(rider.full_name)} wants a ride`;
    subtitle = request.pickup_label ?? "";
  } else if (viewer === "rider") {
    if (iAmIn) {
      title = `Heading to ${campus}`;
      subtitle = driverPos ? `${etaMinutes(driverPos, dropoff)} min` : "";
    } else if (driverHereForMe) {
      title = `${d} is here`;
      subtitle = vehicle ? `${vehicle.color} ${vehicle.make_model} · ${vehicle.license_plate}` : request.pickup_label ?? "";
      tone = "here";
    } else {
      title = driverPos ? `${d} is ${etaMinutes(driverPos, myPickup)} min away` : `${d} is on the way`;
      subtitle = ahead.length ? `Picking up ${ahead.map((s) => first(s.name)).join(", ")} first` : request.pickup_label ?? "";
    }
  } else if (nextStop) {
    title = driverAtNext ? `You're at ${first(nextStop.name)}'s` : `Pick up ${first(nextStop.name)}`;
    subtitle = driverAtNext ? nextStop.label : `${myPos ? `${etaMinutes(myPos, nextStop.pickup)} min · ` : ""}${nextStop.label}`;
    tone = driverAtNext ? "here" : "normal";
  } else {
    title = `Heading to ${campus}`;
    subtitle = myPos ? `${etaMinutes(myPos, dropoff)} min` : "";
  }

  // Map: driver + every rider stop (driver view) or just mine (rider view).
  const visibleStops = viewer === "driver" ? stops.filter((s) => !s.pickedUp) : myStop && !iAmIn ? [myStop] : [];
  const fitPoints: LatLng[] = useMemo(() => {
    const pts: LatLng[] = [];
    if (driverPos) pts.push(driverPos);
    if (viewer === "driver" && nextStop) pts.push(nextStop.pickup);
    else if (viewer === "rider" && !iAmIn) pts.push(myPickup);
    if (!pts.length || allPickedUp || iAmIn) pts.push(dropoff);
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverPos?.lat, driverPos?.lng, nextStop?.requestId, iAmIn, allPickedUp]);

  const navTarget = viewer === "driver" && nextStop ? nextStop.pickup : dropoff;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <BaseMap
        me={viewer === "rider" ? myPos : null}
        cars={driverPos ? [{ id: "driver", pos: driverPos, name: driver.full_name, photo: driver.photo_url, live: true }] : []}
        pins={[
          ...visibleStops.map((s) => ({ id: s.requestId, pos: livePos(s.riderId) ?? s.pickup, kind: "rider" as const, name: s.name, photo: s.photo })),
          { id: "dropoff", pos: dropoff, kind: "dropoff" as const },
        ]}
        fit={done || ended ? [myPickup, dropoff] : fitPoints}
        bottomPadding={440}
      />

      <div className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-app items-center gap-3 p-4">
        <BackButton />
        {trip.podId && (
          <Link href={`/pods/${trip.podId}`} className="glass rounded-full px-4 py-2.5 text-sm font-semibold text-ubc">Pod</Link>
        )}
      </div>

      <div className="sheet max-h-[68dvh] overflow-y-auto">
        <div className="sheet-handle" />

        <div className={`rounded-2xl ${tone === "here" ? "-mx-1 bg-green/10 px-4 py-3" : ""}`}>
          <div className="flex items-center gap-2">
            {tone === "here" && (
              <span className="relative flex h-3 w-3">
                <span className="absolute h-full w-full animate-ping rounded-full bg-green/60" />
                <span className="relative h-3 w-3 rounded-full bg-green" />
              </span>
            )}
            <h1 className={`text-[24px] font-bold leading-tight tracking-tight ${tone === "here" ? "text-green" : "text-ink"}`}>{title}</h1>
          </div>
          {subtitle && <p className="mt-0.5 truncate text-[15px] text-muted">{subtitle}</p>}
        </div>

        {/* Driver: pickup checklist */}
        {viewer === "driver" && !done && !ended && !pending && stops.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {stops.map((s) => {
              const isNext = s.requestId === nextStop?.requestId;
              return (
                <div key={s.requestId} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${isNext ? "glass" : ""} ${s.pickedUp ? "opacity-45" : ""}`}>
                  <Avatar name={s.name} photoUrl={s.photo} size={36} tone="rider" />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-semibold ${s.pickedUp ? "line-through" : "text-ink"}`}>{first(s.name)}</p>
                    <p className="truncate text-xs text-muted">{s.label}</p>
                  </div>
                  {s.pickedUp ? (
                    <Check size={18} className="text-green" aria-label="Picked up" />
                  ) : (
                    s.time && <span className="text-sm font-semibold text-ink">{prettyTime(s.time)}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Rider: driver + car */}
        {viewer === "rider" && (
          <>
            <div className="mt-4 flex items-center gap-3">
              <Link href={`/profile/${driver.id}`} className="shrink-0">
                <Avatar name={driver.full_name} photoUrl={driver.photo_url} size={54} />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-lg font-semibold text-ink">
                  {driver.full_name}
                  {driver.license_verified && <BadgeCheck size={17} className="text-blue" aria-label="Verified" />}
                </p>
                <p className="text-sm text-muted">★ {Number(driver.rating_avg ?? 5).toFixed(1)}{vehicle ? ` · ${vehicle.color} ${vehicle.make_model}` : ""}</p>
              </div>
              {vehicle && (
                <span className="rounded-xl border-2 border-ubc bg-white/70 px-2.5 py-1 font-mono text-base font-bold tracking-wider text-ubc">{vehicle.license_plate}</span>
              )}
            </div>
            {vehicle?.photo_url && !iAmIn && <img src={vehicle.photo_url} alt="" className="mt-3 h-32 w-full rounded-2xl object-cover" />}
            <div className="mt-2"><SharedBadge a={driver} b={rider} /></div>
          </>
        )}

        {/* Quick actions */}
        {!ended && !done && !pending && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
            <a href={`mailto:${other.ubc_email}?subject=Hopped`} className="glass flex flex-col items-center gap-1 rounded-2xl py-3 font-medium">
              <Mail size={19} className="text-ubc" aria-hidden />Message
            </a>
            <button onClick={share} className="glass flex flex-col items-center gap-1 rounded-2xl py-3 font-medium">
              <ShieldCheck size={19} className="text-ubc" aria-hidden />Share
            </button>
            {viewer === "driver" ? (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${navTarget.lat},${navTarget.lng}&travelmode=driving`}
                target="_blank"
                rel="noreferrer"
                className="glass flex flex-col items-center gap-1 rounded-2xl py-3 font-medium"
              >
                <Navigation size={19} className="text-ubc" aria-hidden />Navigate
              </a>
            ) : (
              <Link href={`/profile/${driver.id}`} className="glass flex flex-col items-center gap-1 rounded-2xl py-3 font-medium">
                <User size={19} className="text-ubc" aria-hidden />Profile
              </Link>
            )}
          </div>
        )}

        {/* Where */}
        {viewer === "rider" && (
          <div className="mt-4 flex flex-col gap-2 text-sm">
            <p className="flex items-center gap-2 text-ink"><MapPin size={15} className="text-muted" aria-hidden />{request.pickup_label}</p>
            <p className="flex items-center gap-2 text-ink"><span className="ml-0.5 h-3 w-3 rounded-sm bg-ink" />{campus}</p>
          </div>
        )}

        {request.estimated_cost_cents != null && (
          <>
            <button onClick={() => setShowCost((s) => !s)} className="mt-4 flex w-full items-center justify-between rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm">
              <span className="text-muted">Ride price</span>
              <span className="flex items-center gap-1 font-bold text-ink">
                {formatCents(request.estimated_cost_cents)}
                {showCost ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
              </span>
            </button>
            {showCost && (
              <div className="mt-2">
                <FareBreakdown fare={fareBetween({ lat: request.pickup_lat, lng: request.pickup_lng }, { lat: request.dropoff_lat, lng: request.dropoff_lng })} />
              </div>
            )}
          </>
        )}

        {note && <p className="mt-3 text-center text-sm text-red-700">{note}</p>}

        {/* Primary action */}
        <div className="mt-5 flex flex-col gap-2">
          {ended && <Link href={trip.podId ? `/pods/${trip.podId}` : "/pods"} className="btn-ubc w-full">Back</Link>}
          {(done || (viewer === "rider" && iAmIn && nearCampus)) && (
            <Link href={rateUrl} className="btn-ubc w-full py-4 text-lg">Rate {viewer === "rider" ? d : "your riders"}</Link>
          )}
          {pending && viewer === "driver" && (
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <button disabled={busy} onClick={async () => (await post(`/api/ride-requests/${request.id}/decline`)) && router.push("/pods")} className="btn-ghost">Decline</button>
              <button disabled={busy} onClick={async () => (await post(`/api/ride-requests/${request.id}/accept`)) && router.refresh()} className="btn-ubc">Accept</button>
            </div>
          )}
          {!ended && !done && !pending && viewer === "driver" && nextStop && (
            <button disabled={busy} onClick={async () => (await post(`/api/ride-requests/${nextStop.requestId}/pickup`)) && router.refresh()} className="btn-ubc w-full py-4 text-lg">
              <Check size={20} aria-hidden /> Picked up {first(nextStop.name)}
            </button>
          )}
          {!ended && !done && !pending && viewer === "driver" && allPickedUp && (
            <button disabled={busy} onClick={async () => (await post(`/api/rides/${ride.id}/status`, { status: "completed" })) && router.push(rateUrl)} className="btn-ghost w-full">
              End trip
            </button>
          )}
          {!ended && !done && !iAmIn && viewer === "rider" && (
            <button
              disabled={busy}
              onClick={async () => (await post(`/api/ride-requests/${request.id}/cancel`)) && router.push(trip.podId ? `/pods/${trip.podId}` : "/pods")}
              className="w-full py-2 text-sm font-semibold text-muted"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

