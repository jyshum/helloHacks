"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, Car, Check, Search, UserPlus, Send } from "lucide-react";
import BackButton from "@/components/app/BackButton";
import Avatar from "@/components/Avatar";
import type { PeopleResponse, PersonCard } from "@/app/api/people/route";

type Role = "all" | "driver" | "rider";
const TABS: [Role, string][] = [["all", "Everyone"], ["driver", "Drivers"], ["rider", "Riders"]];

// Search every commuter; drivers invite riders to their pod, riders ask to join a driver's pod.
export default function PeopleSearch({ initialRole }: { initialRole: Role }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role>(initialRole);
  const [data, setData] = useState<PeopleResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ q, ...(role !== "all" ? { role } : {}) });
      const res = await fetch(`/api/people?${params}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, role]);

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-app px-5 pb-12 pt-4">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-bold text-ubc">Find commuters</h1>
      </div>

      <label className="glass mt-5 flex items-center gap-2 rounded-2xl px-4 py-3">
        <Search size={18} className="shrink-0 text-muted" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, faculty or neighbourhood"
          aria-label="Search commuters"
          className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
        />
      </label>

      <div className="mt-3 flex gap-1.5" role="tablist">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={role === value}
            onClick={() => setRole(value)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${role === value ? "bg-ubc text-white" : "bg-white/70 text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {data && !data.me.mode && (
        <Link href="/commute" className="card mt-4 block p-4 text-sm text-ink">
          Set up your commute to see who fits your route and to send invites.
        </Link>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {loading && !data && <p className="py-10 text-center text-sm text-muted">Searching…</p>}
        {data && !data.people.length && <p className="py-10 text-center text-sm text-muted">No commuters match that search.</p>}
        {data?.people.map((p) => <Person key={p.id} p={p} me={data.me} />)}
      </div>
    </main>
  );
}

function Person({ p, me }: { p: PersonCard; me: PeopleResponse["me"] }) {
  const [relation, setRelation] = useState(p.relation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drivers invite riders into their pod; riders ask to join a driver's pod.
  const action =
    me.mode === "driver" && p.mode === "rider" && me.podId
      ? { label: "Invite to my pod", icon: <UserPlus size={15} aria-hidden />, url: `/api/pods/${me.podId}/riders`, body: { riderId: p.id } }
      : me.mode === "rider" && p.mode === "driver" && p.podId
        ? { label: "Request to join", icon: <Send size={15} aria-hidden />, url: `/api/pods/${p.podId}/join`, body: undefined }
        : null;

  async function act() {
    if (!action) return;
    setBusy(true);
    setError(null);
    const res = await fetch(action.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: action.body ? JSON.stringify(action.body) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "That didn't work.");
    // Demo users can't tap Accept, so they join straight away.
    setRelation(body.status === "active" ? "in_pod" : me.mode === "driver" ? "invited" : "requested");
  }

  const done: Record<Exclude<PersonCard["relation"], "none">, string> = {
    in_pod: me.mode === "driver" ? "In your pod" : "Your driver",
    invited: "Invited",
    requested: "Request sent",
  };

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <Link href={`/profile/${p.id}`} className="shrink-0">
          <Avatar name={p.full_name} photoUrl={p.photo_url} size={48} tone={p.mode} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/profile/${p.id}`} className="flex items-center gap-1.5 font-semibold text-ink">
            <span className="truncate">{p.full_name}</span>
            {p.mode === "driver" && p.license_verified && <BadgeCheck size={15} className="shrink-0 text-green" aria-label="Licence verified" />}
          </Link>
          <p className="truncate text-[13px] text-muted">
            {[p.faculty, p.year ? `Year ${p.year}` : null, p.area].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${p.mode === "driver" ? "bg-ubc text-white" : "bg-sky/15 text-blue"}`}>
          {p.mode === "driver" && <Car size={12} aria-hidden />}
          {p.mode === "driver" ? "Drives" : "Rides"}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-ink/5 pt-3">
        <p className={`line-clamp-2 min-w-0 text-[13px] leading-snug ${p.fits ? "font-semibold text-green" : "text-muted"}`}>
          {p.fitNote}
        </p>
        {relation !== "none" ? (
          <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-green">
            <Check size={14} aria-hidden /> {done[relation]}
          </span>
        ) : p.full && me.mode === "rider" ? (
          <span className="shrink-0 rounded-full bg-ink/5 px-3 py-1.5 text-[13px] font-semibold text-muted">Car full</span>
        ) : action ? (
          <button onClick={act} disabled={busy} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold ${p.fits ? "bg-ubc text-white" : "bg-white text-ubc ring-1 ring-ubc/20"}`}>
            {action.icon} {busy ? "Sending…" : action.label}
          </button>
        ) : null}
      </div>
      {error && <p className="mt-2 text-[13px] text-red-700">{error}</p>}
    </div>
  );
}
