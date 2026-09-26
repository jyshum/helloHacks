"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/Avatar";
import SharedBadge from "@/components/SharedBadge";
import Stars from "@/components/Stars";
import GasBreakdown from "./GasBreakdown";
import type { TripBundle } from "@/lib/trip";

export default function MatchView({ trip, viewer }: { trip: TripBundle; viewer: "driver" | "rider" }) {
  const router = useRouter();
  const { request, ride, driver, rider, vehicle } = trip;
  const other = viewer === "rider" ? driver : rider;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Live updates: driver accepting, trip starting/ending.
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

  async function setRideStatus(status: "active" | "completed") {
    setBusy(true);
    const res = await fetch(`/api/rides/${ride.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (!res.ok) return setNote((await res.json()).error);
    if (status === "completed") router.push(`/trip/${ride.id}/complete?request=${request.id}`);
    else router.refresh();
  }

  async function share() {
    const text = `I'm carpooling to ${request.dropoff_label ?? "UBC"} with ${driver.full_name}${
      vehicle ? ` in a ${vehicle.color} ${vehicle.make_model} (${vehicle.license_plate})` : ""
    }. Pickup: ${request.pickup_label}.`;
    try {
      if (navigator.share) await navigator.share({ title: "My UBC Carpool trip", text });
      else {
        await navigator.clipboard.writeText(text);
        setNote("Trip details copied. Paste them to a friend.");
      }
    } catch {
      // user cancelled share sheet
    }
  }

  if (request.status === "pending") {
    return (
      <main className="screen flex flex-col items-center justify-center text-center">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <span className="absolute h-full w-full animate-ping rounded-full bg-sky/30" />
          <Avatar name={driver.full_name} photoUrl={driver.photo_url} size={72} />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-ubc">Waiting for {driver.full_name.split(" ")[0]}</h1>
        <p className="mt-2 text-muted">We sent your request. This updates as soon as they accept.</p>
        <Link href="/map" className="btn-ghost mt-8">Back to map</Link>
      </main>
    );
  }

  if (request.status === "declined" || request.status === "cancelled") {
    return (
      <main className="screen flex flex-col items-center justify-center text-center">
        <h1 className="text-2xl font-bold text-ubc">That driver can&apos;t take you</h1>
        <p className="mt-2 text-muted">No worries. Try another request.</p>
        <Link href="/request" className="btn-sky mt-8">Find another ride</Link>
      </main>
    );
  }

  const tripStarted = ride.status === "active";
  const tripDone = ride.status === "completed" || request.status === "completed";

  return (
    <main className="screen pb-10">
      <Link href="/map" className="text-sm text-muted">← Map</Link>

      <div className="mt-4 text-center">
        <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-3 py-1 text-sm font-semibold text-green">
          ✓ {tripDone ? "Trip complete" : tripStarted ? "Trip in progress" : "Match confirmed"}
        </span>
      </div>

      <div className="card mt-4 p-5 text-center">
        <div className="flex justify-center">
          <Avatar name={other.full_name} photoUrl={other.photo_url} size={80} tone={viewer === "rider" ? "driver" : "rider"} />
        </div>
        <h1 className="mt-3 text-2xl font-bold text-ink">{other.full_name}</h1>
        <p className="text-sm text-muted">
          {[other.faculty, other.year && `Year ${other.year}`].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Stars value={other.rating_avg} count={other.rating_count} />
          {viewer === "rider" && driver.license_verified && (
            <span className="rounded-full bg-ubc px-2.5 py-1 text-xs font-semibold text-white">License verified ✓</span>
          )}
        </div>
        <div className="mt-3">
          <SharedBadge a={driver} b={rider} />
        </div>
      </div>

      {viewer === "rider" && (
        <div className="card mt-3 flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ubc text-white">🚗</div>
          {vehicle ? (
            <div className="flex-1">
              <p className="font-heading font-semibold">{vehicle.color} {vehicle.make_model}</p>
              <p className="text-sm text-muted">{vehicle.province} plate</p>
            </div>
          ) : (
            <p className="flex-1 text-sm text-muted">Vehicle details coming soon</p>
          )}
          {vehicle && (
            <span className="rounded-lg border-2 border-ubc px-2 py-1 font-mono text-sm font-bold tracking-wider text-ubc">
              {vehicle.license_plate}
            </span>
          )}
        </div>
      )}

      <div className="card mt-3 p-4 text-sm">
        <p><span className="text-muted">Pickup:</span> <span className="font-semibold">{request.pickup_label}</span></p>
        <p className="mt-1"><span className="text-muted">Drop-off:</span> <span className="font-semibold">{request.dropoff_label}</span></p>
        <p className="mt-1"><span className="text-muted">Detour:</span> +{request.detour_minutes} min</p>
      </div>

      <div className="mt-3">
        <GasBreakdown detourKm={Number(request.detour_km ?? 0)} totalCents={request.estimated_cost_cents ?? 0} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={`mailto:${other.ubc_email}?subject=UBC Carpool`} className="btn-ghost">Message</a>
        <button onClick={share} className="btn-ghost">Share trip</button>
      </div>

      {note && <p className="mt-3 text-center text-sm text-muted">{note}</p>}

      <div className="mt-4">
        {tripDone ? (
          <Link href={`/trip/${ride.id}/complete?request=${request.id}`} className="btn-sky w-full">
            Rate your {viewer === "rider" ? "driver" : "rider"}
          </Link>
        ) : viewer === "driver" ? (
          tripStarted ? (
            <button onClick={() => setRideStatus("completed")} disabled={busy} className="btn-ubc w-full">End trip</button>
          ) : (
            <button onClick={() => setRideStatus("active")} disabled={busy} className="btn-ubc w-full">Start trip</button>
          )
        ) : (
          <p className="rounded-full bg-frost py-3 text-center text-sm font-semibold text-ubc">
            {tripStarted ? "On the way to campus 🚗" : `${driver.full_name.split(" ")[0]} will start the trip at pickup`}
          </p>
        )}
      </div>
    </main>
  );
}
