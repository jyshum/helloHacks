"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import Avatar from "@/components/Avatar";
import { prettyTime } from "@/lib/pods/time";
import { formatCents } from "@/lib/pricing";
import type { RiderCard } from "@/app/api/pods/[id]/riders/route";

const DAY = ["", "M", "T", "W", "T", "F"];

// Driver side of "Pods for you": riders who fit your route, one tap to add.
export default function RidersForYou({ podId, seatsLeft }: { podId: string; seatsLeft: number }) {
  const router = useRouter();
  const [riders, setRiders] = useState<RiderCard[] | null>(null);
  const [added, setAdded] = useState<Record<string, "invited" | "active">>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pods/${podId}/riders`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setRiders(b.riders ?? []))
      .catch(() => setRiders([]));
  }, [podId]);

  async function add(id: string) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/pods/${podId}/riders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riderId: id }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(body.error ?? "Couldn't add.");
    setAdded((a) => ({ ...a, [id]: body.status }));
    router.refresh();
  }

  const full = seatsLeft - Object.keys(added).length <= 0;

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-bold tracking-tight text-ink">Riders for you</h2>
        <span className="text-[13px] text-muted">{full ? "Car full" : `${seatsLeft - Object.keys(added).length} seats open`}</span>
      </div>
      {error && <p className="mt-3 rounded-2xl bg-red-50/80 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-3 flex flex-col gap-3">
        {riders === null &&
          [0, 1].map((i) => <div key={i} className="card h-[150px] animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />)}
        {riders?.length === 0 && <p className="card p-5 text-center text-sm text-muted">No riders on your route yet. We&apos;ll let you know.</p>}
        {riders?.map((r, i) => {
          const state = added[r.id];
          return (
            <div key={r.id} className="card rise p-4" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center gap-3">
                <Link href={`/profile/${r.id}`}>
                  <Avatar name={r.full_name} photoUrl={r.photo_url} size={46} tone="rider" />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{r.full_name.split(" ")[0]}</p>
                  <p className="truncate text-[13px] text-muted">{[r.faculty?.split(" ")[0], r.year && `Y${r.year}`, r.area].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="rounded-full bg-green/10 px-3 py-1.5 text-sm font-semibold text-green">+{formatCents(r.shareCents)}</span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  {r.week.map((w) => (
                    <span
                      key={w.day}
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                        w.state === "fit" ? "bg-ubc text-white" : w.state === "off" ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300" : "bg-ink/5 text-muted/60"
                      }`}
                    >
                      {DAY[w.day]}
                    </span>
                  ))}
                </div>
                <span className="whitespace-nowrap text-[13px] text-muted">
                  <b className="font-semibold text-ink">{prettyTime(r.pickupTime)}</b> · +{r.detourMinutes} min
                </span>
              </div>

              <button
                onClick={() => add(r.id)}
                disabled={!!state || busy === r.id || full}
                className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 font-semibold transition active:scale-[0.98] ${
                  state ? "bg-green/10 text-green" : "btn-ubc"
                }`}
              >
                {state ? (
                  <>
                    <Check size={17} aria-hidden /> {state === "active" ? "Added" : "Invited"}
                  </>
                ) : busy === r.id ? (
                  "Adding…"
                ) : (
                  "Add"
                )}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
