"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Star } from "lucide-react";
import Avatar from "@/components/Avatar";
import { formatCents } from "@/lib/pricing";
import type { TripBundle } from "@/lib/trip";

export default function CompleteView({ trip, viewer }: { trip: TripBundle; viewer: "driver" | "rider" }) {
  const router = useRouter();
  const { request, ride, driver, rider } = trip;
  const other = viewer === "rider" ? driver : rider;
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    if (request.status === "accepted") {
      await fetch(`/api/ride-requests/${request.id}/complete`, { method: "POST" });
    }
    const res = await fetch("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: ride.id, ratee_id: other.id, score, comment }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error);
    router.push("/map");
    router.refresh();
  }

  const cents = request.estimated_cost_cents ?? 0;

  return (
    <main className="screen flex flex-col">
      <div className="pt-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green text-white">
          <Check size={32} strokeWidth={2.5} aria-hidden />
        </div>
        <h1 className="mt-4 text-3xl font-bold text-ubc">You made it!</h1>
        <p className="mt-1 text-muted">{request.pickup_label} → {request.dropoff_label}</p>
      </div>

      {request.estimated_cost_cents != null && (
      <div className="card mt-6 flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted">Gas contribution</p>
          <p className="font-heading text-3xl font-bold text-ubc">{formatCents(cents)}</p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-green/10 px-3 py-1 text-sm font-semibold text-green">
          <Check size={14} strokeWidth={2.5} aria-hidden />
          {viewer === "rider" ? "Paid" : "Received"}
        </span>
      </div>
      )}

      <div className="card mt-4 p-5 text-center">
        <div className="flex justify-center">
          <Avatar name={other.full_name} photoUrl={other.photo_url} size={56} tone={viewer === "rider" ? "driver" : "rider"} />
        </div>
        <p className="mt-2 font-heading font-semibold">How was riding with {other.full_name.split(" ")[0]}?</p>
        <div className="mt-3 flex justify-center gap-2" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={score === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => setScore(n)}
              className={`transition ${n <= score ? "text-sky" : "text-line"} hover:scale-110`}
            >
              <Star size={36} fill="currentColor" strokeWidth={0} aria-hidden />
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a note (optional)"
          rows={2}
          className="input mt-4 resize-none"
        />
      </div>

      {error && <p className="mt-3 text-center text-sm text-red-700">{error}</p>}

      <div className="mt-auto pt-6">
        <button onClick={submit} disabled={!score || busy} className="btn-ubc w-full">
          {busy ? "Submitting…" : "Submit rating"}
        </button>
        <button onClick={() => router.push("/map")} className="mt-2 w-full py-2 text-sm text-muted">
          Skip
        </button>
      </div>
    </main>
  );
}
