"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PlaceSelect from "@/components/PlaceSelect";
import { CAMPUS_SPOTS, PICKUP_SPOTS, type Place } from "@/lib/places";
import { formatCents, PRICING_FORMULA } from "@/lib/pricing";
import { MAX_DETOUR_MINUTES } from "@/lib/matching";

type Quote = { rideId: string; driverName: string; licenseVerified: boolean; detourMinutes: number; detourKm: number; estimatedCostCents: number; valid: boolean };

export default function RequestPage() {
  const router = useRouter();
  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(CAMPUS_SPOTS[0]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!pickup) return;
    let cancelled = false;
    setQuoting(true);
    setError(null);
    setQuote(null);
    fetch("/api/ride-requests/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pickup: { lat: pickup.lat, lng: pickup.lng } }),
    })
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (ok) setQuote(body.quote);
        else setError(body.error);
      })
      .finally(() => !cancelled && setQuoting(false));
    return () => {
      cancelled = true;
    };
  }, [pickup]);

  async function submit() {
    if (!pickup || !dropoff || !quote) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/ride-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ride_id: quote.rideId,
        pickup: { lat: pickup.lat, lng: pickup.lng },
        pickup_label: pickup.label,
        dropoff: { lat: dropoff.lat, lng: dropoff.lng },
        dropoff_label: dropoff.label,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setSubmitting(false);
      setError(body.error);
      return;
    }
    router.push(`/match/${body.request.id}`);
  }

  const tooFar = quote && !quote.valid;

  return (
    <main className="screen flex flex-col">
      <Link href="/map" className="text-sm text-muted">← Map</Link>
      <h1 className="mt-4 text-3xl font-bold text-ubc">Request a ride</h1>
      <p className="mt-1 text-muted">We&apos;ll match you with a driver already heading your way.</p>

      <div className="card mt-6 flex flex-col gap-4 p-5">
        <PlaceSelect id="pickup" label="Pickup" places={PICKUP_SPOTS} value={pickup} onChange={setPickup} allowCurrentLocation />
        <PlaceSelect id="dropoff" label="Destination" places={CAMPUS_SPOTS} value={dropoff} onChange={setDropoff} />
      </div>

      {quoting && <p className="mt-4 text-center text-sm text-muted">Finding drivers on your route…</p>}

      {quote && (
        <div className="card mt-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-heading font-semibold text-ink">Best match: {quote.driverName}</p>
              {quote.licenseVerified && <p className="text-xs font-semibold text-green">License verified ✓</p>}
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tooFar ? "bg-red-50 text-red-700" : "bg-green/10 text-green"}`}>
              +{quote.detourMinutes} min detour
            </span>
          </div>
          <div className="mt-4 rounded-2xl bg-frost p-4">
            <p className="text-sm text-muted">Estimated gas contribution</p>
            <p className="font-heading text-3xl font-bold text-ubc">{formatCents(quote.estimatedCostCents)}</p>
            <p className="mt-1 text-xs text-muted">
              {PRICING_FORMULA}. Detour: {quote.detourKm} km.
            </p>
          </div>
          {tooFar && (
            <p className="mt-3 text-sm text-red-700">
              This pickup is more than {MAX_DETOUR_MINUTES} min out of the driver&apos;s way. Try a spot closer to a main route.
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-auto pt-6">
        <button onClick={submit} disabled={!quote || !!tooFar || submitting || !dropoff} className="btn-sky w-full">
          {submitting
            ? "Sending request…"
            : quote
              ? `Request ride · ${formatCents(quote.estimatedCostCents)} gas`
              : "Request ride"}
        </button>
        <p className="mt-2 text-center text-xs text-muted">
          Gas contribution only. Drivers share costs, they don&apos;t profit.
        </p>
      </div>
    </main>
  );
}
