"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag } from "lucide-react";
import Avatar from "@/components/Avatar";
import type { AdminReport, ReportsData } from "@/components/pods/chat/reports";

const POLL_MS = 5000;

// "Reports" section on /admin: chat messages that pod members flagged.
export default function AdminReports({ initial }: { initial: ReportsData }) {
  const [data, setData] = useState<ReportsData>(initial);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/reports", { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  return (
    <section className="mt-10">
      <div className="flex items-center gap-2">
        <Flag size={18} className="text-red-600" aria-hidden />
        <h2 className="font-heading text-xl font-bold text-ubc">Chat reports</h2>
        <span className="text-sm text-muted">{data.open.length} open</span>
      </div>

      {data.open.length === 0 && <div className="card mt-3 p-6 text-center text-sm text-muted">No open reports.</div>}

      <div className="mt-3 flex flex-col gap-3">
        {data.open.map((r) => (
          <ReportCard key={r.id} r={r} onDone={load} />
        ))}
      </div>

      {data.recent.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Recently resolved</h3>
          <div className="mt-2 flex flex-col gap-2">
            {data.recent.map((r) => (
              <div key={r.id} className="card flex items-center gap-3 p-3 text-sm">
                <Avatar name={r.reported?.full_name} photoUrl={r.reported?.photo_url} size={32} tone="rider" />
                <p className="min-w-0 flex-1 truncate text-muted">
                  <span className="font-semibold text-ink">{r.reported?.full_name ?? "Former member"}</span> · {r.reason}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.message_id ? "bg-paper text-muted" : "bg-red-50 text-red-700"}`}>
                  {r.message_id ? "dismissed" : "removed"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ReportCard({ r, onDone }: { r: AdminReport; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "dismiss" | "remove") {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, action }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Something went wrong.");
    onDone();
  }

  const mins = Math.max(1, Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000));

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <Avatar name={r.reported?.full_name} photoUrl={r.reported?.photo_url} size={40} tone="rider" />
        <div className="min-w-0 flex-1">
          <p className="font-heading font-semibold text-ink">{r.reported?.full_name ?? "Former member"}</p>
          <p className="truncate text-xs text-muted">{r.reported?.ubc_email ?? "Account deleted"}</p>
        </div>
        <span className="text-xs text-muted">{mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`}</span>
      </div>

      <blockquote className="mt-3 whitespace-pre-wrap rounded-xl bg-paper px-3 py-2 text-sm text-ink">
        {r.message_body ?? "(message unavailable)"}
      </blockquote>
      <p className="mt-2 text-sm">
        <span className="font-semibold text-red-700">{r.reason}</span>
        <span className="text-muted"> · reported by {r.reporter?.full_name ?? "a member"}</span>
      </p>
      {!r.message_id && <p className="mt-1 text-xs text-muted">The message has already been removed.</p>}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => act("dismiss")} disabled={busy} className="btn-ghost">
          Dismiss
        </button>
        <button onClick={() => act("remove")} disabled={busy || !r.message_id} className="btn bg-red-600 text-white">
          Remove message
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
