"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { APIProvider } from "@vis.gl/react-google-maps";
import { BadgeCheck, ChevronDown, ChevronUp, Mail, Navigation, ShieldCheck, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BaseMap from "@/components/app/BaseMap";
import BackButton from "@/components/app/BackButton";
import { useMyLocation, usePresence } from "@/components/app/hooks";
import Avatar from "@/components/Avatar";
import SharedBadge from "@/components/SharedBadge";
import GasBreakdown from "./GasBreakdown";
import { etaMinutes, type LatLng } from "@/lib/geo";
import { formatCents } from "@/lib/pricing";
import type { TripBundle } from "@/lib/trip";

type Viewer = "driver" | "rider";

export default function MatchView(props: { trip: TripBundle; viewer: Viewer }) {
  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      <TripScreen {...props} />
    </APIProvider>
  );
}

function TripScreen({ trip, viewer }: { trip: TripBundle; viewer: Viewer }) {
  const router = useRouter();
  const { request, ride, driver, rider, vehicle } = trip;
  const meUser = viewer === "driver" ? driver : rider;
  const other = viewer === "driver" ? rider : driver;
  const myPos = useMyLocation();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showCost, setShowCost] = useState(false);

  // Both sides share live GPS on a private per-trip channel.
  const live = usePresence(`trip-${request.id}`, { id: meUser.id, role: viewer, full_name: meUser.full_name }, myPos, 2500);
  const otherPos: LatLng | null = live.find((u) => u.user_id === other.id) ?? null;
  const driverPos = viewer === "driver" ? myPos : otherPos;
  const riderPos = viewer === "rider" ? myPos : otherPos;

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`match-${request.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ride_requests", filter: `id=eq.${request.id}` }, () => router.refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${ride.id}` }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [request.id, ride.id, router]);

  const pickup = { lat: request.pickup_lat, lng: request.pickup_lng };
  const dropoff = { lat: request.dropoff_lat, lng: request.dropoff_lng };
  const started = ride.status === "active";
  const done = ride.status === "completed" || request.status === "completed";
  const ended = request.status === "declined" || request.status === "cancelled";
  const first = (n: string) => n.split(" ")[0];

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

  async function share() {
    const text = `I'm carpooling to ${request.dropoff_label ?? "UBC"} with ${driver.full_name}${
      vehicle ? ` in a ${vehicle.color} ${vehicle.make_model} (${vehicle.license_plate})` : ""
    }. Pickup: ${request.pickup_label}.`;
    try {
      if (navigator.share) await navigator.share({ title: "My UBC Carpool trip", text });
      else {
        await navigator.clipboard.writeText(text);
        setNote("Trip details copied.");
      }
    } catch {}
  }

  // Status line, Uber style.
  let title = "";
  let subtitle = "";
  if (ended) {
    title = request.status === "declined" ? `${first(driver.full_name)} couldn't take this ride` : "Ride cancelled";
    subtitle = viewer === "rider" ? "Pick another driver." : "";
  } else if (done) {
    title = "You've arrived";
    subtitle = `${request.dropoff_label}`;
  } else if (request.status === "pending") {
    title = viewer === "rider" ? `Waiting for ${first(driver.full_name)} to accept` : `${first(rider.full_name)} wants a ride`;
    subtitle = viewer === "rider" ? "You'll be notified here instantly." : request.pickup_label ?? "";
  } else if (started) {
    title = `Heading to ${request.dropoff_label}`;
    subtitle = driverPos ? `About ${etaMinutes(driverPos, dropoff)} min` : "Enjoy the ride";
  } else if (viewer === "rider") {
    title = driverPos ? `${first(driver.full_name)} is ${etaMinutes(driverPos, pickup)} min away` : `${first(driver.full_name)} is on the way`;
    subtitle = `Meet at ${request.pickup_label}`;
  } else {
    title = `Pick up ${first(rider.full_name)}`;
    subtitle = myPos ? `${etaMinutes(myPos, pickup)} min · ${request.pickup_label}` : `${request.pickup_label}`;
  }

  const fitPoints: LatLng[] = started
    ? [driverPos ?? pickup, dropoff]
    : [pickup, ...(driverPos ? [driverPos] : [{ lat: ride.origin_lat, lng: ride.origin_lng }])];

  const navTarget = started ? dropoff : pickup;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-paper">
      <BaseMap
        me={myPos}
        cars={viewer === "rider" && otherPos ? [{ id: "driver", pos: otherPos }] : []}
        pins={[
          { id: "pickup", pos: pickup, kind: "pickup" },
          { id: "dropoff", pos: dropoff, kind: "dropoff" },
          ...(viewer === "driver" && riderPos && !started ? [{ id: "rider", pos: riderPos, kind: "rider" as const }] : []),
        ]}
        fit={done || ended ? [pickup, dropoff] : fitPoints}
        bottomPadding={430}
      />

      <div className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-app items-center gap-3 p-4">
        <BackButton />
        {otherPos && !done && !ended && (
          <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-green shadow-soft">
            <span className="h-2 w-2 rounded-full bg-green" />
            {first(other.full_name)} is live
          </span>
        )}
      </div>

      <div className="sheet max-h-[66dvh] overflow-y-auto">
        <div className="sheet-handle" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-xl font-bold leading-tight text-ink">{title}</h1>
            {subtitle && <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>}
          </div>
          {request.status === "pending" && viewer === "rider" && (
            <span className="relative mt-2 flex h-3 w-3 shrink-0">
              <span className="absolute h-full w-full animate-ping rounded-full bg-blue/50" />
              <span className="relative h-3 w-3 rounded-full bg-blue" />
            </span>
          )}
        </div>

        {/* Person + car */}
        <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
          <Link href={`/profile/${other.id}`} className="shrink-0">
            <Avatar name={other.full_name} photoUrl={other.photo_url} size={56} tone={viewer === "rider" ? "driver" : "rider"} />
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={`/profile/${other.id}`} className="font-heading text-lg font-semibold text-ink">
              {other.full_name}
            </Link>
            <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted">
              <span>★ {Number(other.rating_avg ?? 5).toFixed(1)}</span>
              {other.faculty && <span>· {other.faculty}</span>}
              {viewer === "rider" && driver.license_verified && (
                <span className="inline-flex items-center gap-0.5 text-green">
                  · <BadgeCheck size={14} aria-hidden /> License
                </span>
              )}
            </p>
          </div>
          {viewer === "rider" && vehicle && (
            <div className="text-right">
              <p className="rounded-lg border-2 border-ubc px-2 py-0.5 font-mono text-base font-bold tracking-wider text-ubc">{vehicle.license_plate}</p>
              <p className="mt-1 text-xs text-muted">{vehicle.color} {vehicle.make_model}</p>
            </div>
          )}
        </div>
        <div className="mt-2">
          <SharedBadge a={driver} b={rider} />
        </div>

        {/* Actions */}
        {!ended && !done && request.status !== "pending" && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
            <a href={`mailto:${other.ubc_email}?subject=UBC Carpool`} className="flex flex-col items-center gap-1 rounded-2xl bg-paper py-3 font-medium">
              <Mail size={20} className="text-ubc" aria-hidden />Message
            </a>
            <button onClick={share} className="flex flex-col items-center gap-1 rounded-2xl bg-paper py-3 font-medium">
              <ShieldCheck size={20} className="text-ubc" aria-hidden />Share trip
            </button>
            {viewer === "driver" ? (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${navTarget.lat},${navTarget.lng}&travelmode=driving`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1 rounded-2xl bg-paper py-3 font-medium"
              >
                <Navigation size={20} className="text-ubc" aria-hidden />Navigate
              </a>
            ) : (
              <Link href={`/profile/${other.id}`} className="flex flex-col items-center gap-1 rounded-2xl bg-paper py-3 font-medium">
                <User size={20} className="text-ubc" aria-hidden />Profile
              </Link>
            )}
          </div>
        )}

        {/* Route + cost */}
        <div className="mt-4 rounded-2xl bg-paper p-4 text-sm">
          <p className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ink" /><span className="text-ink">{request.pickup_label}</span></p>
          <p className="mt-2 flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 bg-ink" /><span className="text-ink">{request.dropoff_label}</span></p>
          <button onClick={() => setShowCost((s) => !s)} className="mt-3 flex w-full items-center justify-between border-t border-line pt-3">
            <span className="text-muted">Gas contribution</span>
            <span className="flex items-center gap-1 font-heading font-bold text-ink">
              {formatCents(request.estimated_cost_cents ?? 0)}
              {showCost ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
            </span>
          </button>
        </div>
        {showCost && (
          <div className="mt-2">
            <GasBreakdown detourKm={Number(request.detour_km ?? 0)} totalCents={request.estimated_cost_cents ?? 0} />
          </div>
        )}

        {note && <p className="mt-3 text-center text-sm text-red-700">{note}</p>}

        {/* Primary button */}
        <div className="mt-4 flex flex-col gap-2">
          {ended && viewer === "rider" && <Link href="/map" className="btn-ubc w-full">Find another ride</Link>}
          {ended && viewer === "driver" && <Link href="/map" className="btn-ubc w-full">Back to map</Link>}
          {done && (
            <Link href={`/trip/${ride.id}/complete?request=${request.id}`} className="btn-ubc w-full">
              Rate {first(other.full_name)}
            </Link>
          )}
          {!ended && !done && request.status === "pending" && viewer === "driver" && (
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <button disabled={busy} onClick={async () => (await post(`/api/ride-requests/${request.id}/decline`)) && router.push("/map")} className="btn-ghost">Decline</button>
              <button disabled={busy} onClick={async () => (await post(`/api/ride-requests/${request.id}/accept`)) && router.refresh()} className="btn-ubc">Accept</button>
            </div>
          )}
          {!ended && !done && request.status === "accepted" && viewer === "driver" && (
            started ? (
              <button disabled={busy} onClick={async () => (await post(`/api/rides/${ride.id}/status`, { status: "completed" })) && router.push(`/trip/${ride.id}/complete?request=${request.id}`)} className="btn-ubc w-full py-4 text-lg">
                End trip
              </button>
            ) : (
              <button disabled={busy} onClick={async () => (await post(`/api/rides/${ride.id}/status`, { status: "active" })) && router.refresh()} className="btn-ubc w-full py-4 text-lg">
                Start trip
              </button>
            )
          )}
          {!ended && !done && !started && viewer === "rider" && (
            <button
              disabled={busy}
              onClick={async () => (await post(`/api/ride-requests/${request.id}/cancel`)) && router.push("/map")}
              className="w-full py-2 text-sm font-semibold text-red-700"
            >
              Cancel request
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
