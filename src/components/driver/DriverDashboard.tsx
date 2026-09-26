"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/Avatar";
import SharedBadge from "@/components/SharedBadge";
import Stars from "@/components/Stars";
import PlaceSelect from "@/components/PlaceSelect";
import { CAMPUS_SPOTS, PICKUP_SPOTS, type Place } from "@/lib/places";
import { formatCents } from "@/lib/pricing";
import type { Ride, RideRequest, User } from "@/lib/types";

type Rider = Pick<User, "id" | "full_name" | "faculty" | "year" | "photo_url" | "rating_avg" | "rating_count">;
type Req = RideRequest & { rider: Rider | null };

export default function DriverDashboard({ me, rides, requests }: { me: User; rides: Ride[]; requests: Req[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refresh when riders request or anything changes on my rides.
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("driver-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_requests" }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [router]);

  async function act(id: string, action: "accept" | "decline") {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/ride-requests/${id}/${action}`, { method: "POST" });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) return setError(body.error);
    if (action === "accept") router.push(`/match/${id}`);
    else router.refresh();
  }

  const pending = requests.filter((r) => r.status === "pending");
  const accepted = requests.filter((r) => r.status === "accepted");
  const ride = rides[0];

  return (
    <main className="screen">
      <Link href="/map" className="text-sm text-muted">← Map</Link>
      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-ubc">Driver</h1>
        {ride && (
          <span className="flex items-center gap-2 rounded-full bg-green/10 px-3 py-1 text-sm font-semibold text-green">
            <span className="h-2 w-2 rounded-full bg-green" /> Online
          </span>
        )}
      </div>

      {!ride ? (
        <PostRoute onPosted={() => router.refresh()} />
      ) : (
        <div className="card mt-5 bg-ubc p-5 text-white">
          <p className="text-sm text-white/70">Your route</p>
          <p className="mt-1 font-heading text-lg font-semibold">
            {ride.origin_label} → {ride.destination_label}
          </p>
          <p className="mt-1 text-sm text-white/70">
            Leaving {new Date(ride.departure_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} ·{" "}
            {ride.seats_available} {ride.seats_available === 1 ? "seat" : "seats"} left
          </p>
        </div>
      )}

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {accepted.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Confirmed</h2>
          {accepted.map((r) => (
            <Link key={r.id} href={`/match/${r.id}`} className="card mb-3 flex items-center gap-3 p-4">
              <Avatar name={r.rider?.full_name} photoUrl={r.rider?.photo_url} tone="rider" size={40} />
              <div className="flex-1">
                <p className="font-heading font-semibold">{r.rider?.full_name}</p>
                <p className="text-sm text-muted">Pickup: {r.pickup_label}</p>
              </div>
              <span className="text-blue">→</span>
            </Link>
          ))}
        </section>
      )}

      {ride && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Requests {pending.length > 0 && `(${pending.length})`}
          </h2>
          {pending.length === 0 && (
            <div className="card p-6 text-center text-muted">
              Waiting for riders on your route. New requests show up here live.
            </div>
          )}
          {pending.map((r) => (
            <div key={r.id} className="card mb-3 p-4">
              <div className="flex items-start gap-3">
                <Avatar name={r.rider?.full_name} photoUrl={r.rider?.photo_url} tone="rider" size={48} />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-heading font-semibold">{r.rider?.full_name}</p>
                    <Stars value={r.rider?.rating_avg ?? 5} />
                  </div>
                  <p className="text-sm text-muted">
                    {[r.rider?.faculty, r.rider?.year && `Year ${r.rider.year}`].filter(Boolean).join(" · ")}
                  </p>
                  {r.rider && (
                    <div className="mt-2">
                      <SharedBadge a={me} b={r.rider} />
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-frost p-3 text-center text-sm">
                <div>
                  <p className="font-heading font-semibold text-ubc">+{r.detour_minutes ?? "–"} min</p>
                  <p className="text-xs text-muted">detour</p>
                </div>
                <div>
                  <p className="font-heading font-semibold text-ubc">{r.detour_km ?? "–"} km</p>
                  <p className="text-xs text-muted">extra</p>
                </div>
                <div>
                  <p className="font-heading font-semibold text-ubc">
                    {r.estimated_cost_cents != null ? formatCents(r.estimated_cost_cents) : "–"}
                  </p>
                  <p className="text-xs text-muted">gas</p>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted">Pickup: {r.pickup_label}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => act(r.id, "decline")} disabled={busy === r.id} className="btn-ghost">
                  Decline
                </button>
                <button onClick={() => act(r.id, "accept")} disabled={busy === r.id} className="btn-ubc">
                  Accept
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

function PostRoute({ onPosted }: { onPosted: () => void }) {
  const [origin, setOrigin] = useState<Place | null>(null);
  const [dest, setDest] = useState<Place | null>(CAMPUS_SPOTS[0]);
  const [time, setTime] = useState(() => {
    const d = new Date(Date.now() + 15 * 60000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [seats, setSeats] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post() {
    if (!origin || !dest) return;
    setBusy(true);
    setError(null);
    const [h, m] = time.split(":").map(Number);
    const dep = new Date();
    dep.setHours(h, m, 0, 0);
    const res = await fetch("/api/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: { lat: origin.lat, lng: origin.lng },
        origin_label: origin.label,
        destination: { lat: dest.lat, lng: dest.lng },
        destination_label: dest.label,
        departure_time: dep.toISOString(),
        seats_available: seats,
      }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error);
    onPosted();
  }

  return (
    <div className="card mt-5 flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-xl font-bold text-ubc">Post your route</h2>
        <p className="text-sm text-muted">Go online so riders on the way can find you.</p>
      </div>
      <PlaceSelect id="origin" label="Starting from" places={PICKUP_SPOTS} value={origin} onChange={setOrigin} allowCurrentLocation />
      <PlaceSelect id="dest" label="Heading to" places={CAMPUS_SPOTS} value={dest} onChange={setDest} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="time">Leaving at</label>
          <input id="time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="seats">Seats</label>
          <select id="seats" className="input" value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button onClick={post} disabled={!origin || !dest || busy} className="btn-ubc">
        {busy ? "Going online…" : "Go online"}
      </button>
    </div>
  );
}
