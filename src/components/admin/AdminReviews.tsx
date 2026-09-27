"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from "react";
import BackButton from "@/components/app/BackButton";
import Avatar from "@/components/Avatar";
import type { AdminReview } from "@/lib/reviews";

const POLL_MS = 5000;
const QUICK_REASONS = ["Photo blurry or unreadable", "Face doesn't match license", "License expired", "Name doesn't match profile"];

type Data = { pending: AdminReview[]; recent: AdminReview[] };

export default function AdminReviews({ initial }: { initial: Data }) {
  const [data, setData] = useState<Data>(initial);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/licenses", { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, []);

  // Live: new submissions appear within a few seconds.
  useEffect(() => {
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl bg-paper px-4 py-5">
      <div className="flex items-center gap-3">
        <BackButton />
        <div className="flex-1">
          <h1 className="font-heading text-2xl font-bold text-ubc">License reviews</h1>
          <p className="text-sm text-muted">
            {data.pending.length} waiting · updates live
          </p>
        </div>
      </div>

      {data.pending.length === 0 && (
        <div className="card mt-6 p-8 text-center text-muted">All caught up. New submissions show up here automatically.</div>
      )}

      <div className="mt-5 flex flex-col gap-4">
        {data.pending.map((r) => (
          <ReviewCard key={r.id} r={r} onDone={load} onZoom={setZoom} />
        ))}
      </div>

      {data.recent.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Recent decisions</h2>
          <div className="mt-2 flex flex-col gap-2">
            {data.recent.map((r) => (
              <div key={r.id} className="card flex items-center gap-3 p-3 text-sm">
                <Avatar name={r.user.full_name} photoUrl={r.user.photo_url} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{r.user.full_name}</p>
                  <p className="truncate text-xs text-muted">
                    {r.status === "rejected" && r.reject_reason ? r.reject_reason : "Approved"}
                    {r.reviewer ? ` · by ${r.reviewer}` : ""}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "approved" ? "bg-green/10 text-green" : "bg-red-50 text-red-700"}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {zoom && (
        <button onClick={() => setZoom(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4" aria-label="Close">
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-xl" />
        </button>
      )}
    </main>
  );
}

function ReviewCard({ r, onDone, onZoom }: { r: AdminReview; onDone: () => void; onZoom: (url: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/licenses/${r.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error);
    onDone();
  }

  const mins = Math.max(1, Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000));

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <Avatar name={r.user.full_name} photoUrl={r.user.photo_url} size={48} />
        <div className="min-w-0 flex-1">
          <p className="font-heading font-semibold text-ink">{r.user.full_name}</p>
          <p className="truncate text-xs text-muted">
            {r.user.ubc_email}
            {r.user.faculty ? ` · ${r.user.faculty}` : ""}
          </p>
        </div>
        <span className="text-xs text-muted">{mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Photo label="License" url={r.licenseUrl} onZoom={onZoom} />
        <Photo label="Selfie with license" url={r.selfieUrl} onZoom={onZoom} />
      </div>
      {r.recordUrl &&
        (r.recordIsPdf ? (
          <a href={r.recordUrl} target="_blank" rel="noreferrer" className="mt-2 block rounded-xl bg-frost px-3 py-2 text-sm font-semibold text-blue">
            📄 Open ICBC driving record (PDF)
          </a>
        ) : (
          <div className="mt-2">
            <Photo label="ICBC driving record" url={r.recordUrl} onZoom={onZoom} />
          </div>
        ))}

      <div className="mt-3 rounded-xl bg-paper p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Car</p>
        {r.vehicle ? (
          <div className="mt-2 flex items-center gap-3">
            {r.vehicle.photo_url && (
              <button onClick={() => onZoom(r.vehicle!.photo_url!)} className="shrink-0">
                <img src={r.vehicle.photo_url} alt="Car" className="h-16 w-24 rounded-lg object-cover" />
              </button>
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold text-ink">{r.vehicle.color} {r.vehicle.make_model}</p>
              <p className="text-xs text-muted">Check the plate in the photo matches</p>
            </div>
            <span className="rounded-md border-2 border-ubc px-1.5 py-0.5 font-mono text-xs font-bold text-ubc">
              {r.vehicle.license_plate} · {r.vehicle.province}
            </span>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">No car added yet.</p>
        )}
      </div>

      <p className="mt-3 text-xs text-muted">Check: face matches · name matches “{r.user.full_name}” · not expired · plate matches</p>

      {rejecting ? (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            {QUICK_REASONS.map((q) => (
              <button key={q} onClick={() => setReason(q)} className={`rounded-full border px-3 py-1 text-xs ${reason === q ? "border-ubc bg-frost text-ubc" : "border-line text-muted"}`}>
                {q}
              </button>
            ))}
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason the driver will see" className="input mt-2" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={() => setRejecting(false)} className="btn-ghost">Back</button>
            <button onClick={() => decide("reject")} disabled={busy || !reason.trim()} className="btn bg-red-600 text-white">Reject</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
          <button onClick={() => setRejecting(true)} disabled={busy} className="btn-ghost">Reject</button>
          <button onClick={() => decide("approve")} disabled={busy} className="btn bg-green text-white">Approve</button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function Photo({ label, url, onZoom }: { label: string; url: string | null; onZoom: (u: string) => void }) {
  return (
    <button onClick={() => url && onZoom(url)} className="overflow-hidden rounded-xl bg-paper text-left">
      {url ? <img src={url} alt={label} className="h-36 w-full object-cover" /> : <div className="flex h-36 items-center justify-center text-muted">Missing</div>}
      <p className="px-2 py-1 text-xs text-muted">{label} · tap to zoom</p>
    </button>
  );
}
