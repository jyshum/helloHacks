"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Camera, Car, Check, ChevronRight, GraduationCap, IdCard, Lock, MessageCircle, Pencil, Route, User, Wallet } from "lucide-react";
import BackButton from "@/components/app/BackButton";
import SignOutButton from "@/components/app/SignOutButton";
import Avatar from "@/components/Avatar";
import EnableNotifications from "@/components/pods/EnableNotifications";
import Disclaimer from "@/components/Disclaimer";
import { FACULTIES } from "@/lib/auth";
import { shortCampus } from "@/lib/places";
import { prettyTime } from "@/lib/pods/time";
import type { ChatPreference } from "@/lib/types";

export type SettingsData = {
  id: string;
  email: string;
  full_name: string;
  faculty: string | null;
  year: number | null;
  photo_url: string | null;
  chat_preference: ChatPreference;
  rating_avg: number;
  rating_count: number;
  commute: { mode: "driver" | "rider"; active: boolean; area: string | null; days: number[]; arriveBy: string; campus: string } | null;
  vehicle: string | null;
  license: "verified" | "pending" | "rejected" | "none";
};

const VIBES: { value: ChatPreference; label: string }[] = [
  { value: "chatty", label: "Likes to chat" },
  { value: "quiet", label: "Prefers quiet" },
  { value: "no_preference", label: "Either is fine" },
];
const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];
const vibeLabel = (v: ChatPreference) => VIBES.find((x) => x.value === v)?.label ?? "Either is fine";
const yearLabel = (y: number | null) => (y ? (y === 5 ? "Year 5+" : `Year ${y}`) : "Not set");

export default function SettingsView({ data, justSaved = false }: { data: SettingsData; justSaved?: boolean }) {
  const router = useRouter();
  const [profile, setProfile] = useState({
    full_name: data.full_name,
    faculty: data.faculty,
    year: data.year,
    chat_preference: data.chat_preference,
    photo_url: data.photo_url,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(justSaved);
  const fileRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(profile);
    setPhoto(null);
    setRemovePhoto(false);
    setError(null);
    setSaved(false);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("full_name", draft.full_name);
    form.set("faculty", draft.faculty ?? "");
    form.set("year", draft.year ? String(draft.year) : "");
    form.set("chat_preference", draft.chat_preference);
    if (photo) form.set("photo", photo.file);
    else if (removePhoto) form.set("remove_photo", "1");
    const res = await fetch("/api/me", { method: "PATCH", body: form });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Couldn't save your changes.");
    setProfile(body.profile);
    setEditing(false);
    setSaved(true);
    // Refresh server data (menu avatar and name); the flag keeps "Saved" if the page re-mounts.
    router.replace("/settings?saved=1");
    router.refresh();
  }

  const shownPhoto = editing ? (photo?.preview ?? (removePhoto ? null : draft.photo_url)) : profile.photo_url;
  const c = data.commute;

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-app px-5 pb-14 pt-4">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-bold text-ubc">Settings</h1>
      </div>

      {/* Profile */}
      <section className="card mt-5 p-5">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            {shownPhoto ? (
              <img src={shownPhoto} alt="" className="h-20 w-20 rounded-full border-2 border-white object-cover shadow-soft" />
            ) : (
              <Avatar name={editing ? draft.full_name : profile.full_name} size={80} />
            )}
            {editing && (
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-ubc text-white shadow-soft"
                aria-label="Change photo"
              >
                <Camera size={15} aria-hidden />
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPhoto({ file: f, preview: URL.createObjectURL(f) });
                  setRemovePhoto(false);
                }
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold text-ink">{editing ? draft.full_name || "Your name" : profile.full_name}</p>
            <p className="text-sm text-muted">★ {data.rating_avg.toFixed(1)} · {data.rating_count} {data.rating_count === 1 ? "rating" : "ratings"}</p>
            {editing && (profile.photo_url || photo) && !removePhoto && (
              <button
                onClick={() => {
                  setPhoto(null);
                  setRemovePhoto(true);
                }}
                className="mt-1 text-xs font-semibold text-muted underline"
              >
                Remove photo
              </button>
            )}
          </div>
          {!editing && (
            <button onClick={startEdit} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-ubc shadow-soft">
              <Pencil size={14} aria-hidden /> Edit
            </button>
          )}
        </div>

        {saved && !editing && (
          <p className="mt-4 flex items-center gap-1.5 rounded-xl bg-green/10 px-3 py-2 text-sm font-semibold text-green">
            <Check size={15} aria-hidden /> Saved
          </p>
        )}

        <div className="mt-4 divide-y divide-ink/5">
          <Field icon={<User size={18} aria-hidden />} label="Full name">
            {editing ? (
              <input value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} maxLength={60} className="input mt-1" aria-label="Full name" />
            ) : (
              profile.full_name
            )}
          </Field>

          <Field icon={<Lock size={18} aria-hidden />} label="UBC email">
            <span className="flex items-center gap-1.5">
              <span className="truncate">{data.email}</span>
              <BadgeCheck size={15} className="shrink-0 text-green" aria-label="Verified" />
            </span>
            {editing && <span className="mt-0.5 block text-xs text-muted">Your verified UBC email can&apos;t be changed.</span>}
          </Field>

          <Field icon={<GraduationCap size={18} aria-hidden />} label="Faculty and year">
            {editing ? (
              <div className="mt-1 grid grid-cols-[1fr_96px] gap-2">
                <select value={draft.faculty ?? ""} onChange={(e) => setDraft({ ...draft, faculty: e.target.value || null })} className="input" aria-label="Faculty">
                  <option value="">Not set</option>
                  {FACULTIES.map((f) => <option key={f}>{f}</option>)}
                </select>
                <select value={draft.year ?? ""} onChange={(e) => setDraft({ ...draft, year: e.target.value ? Number(e.target.value) : null })} className="input" aria-label="Year">
                  <option value="">–</option>
                  {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y === 5 ? "5+" : y}</option>)}
                </select>
              </div>
            ) : (
              [profile.faculty ?? "Faculty not set", yearLabel(profile.year)].join(" · ")
            )}
          </Field>

          <Field icon={<MessageCircle size={18} aria-hidden />} label="Ride vibe">
            {editing ? (
              <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ride vibe">
                {VIBES.map((v) => (
                  <button
                    key={v.value}
                    role="radio"
                    aria-checked={draft.chat_preference === v.value}
                    onClick={() => setDraft({ ...draft, chat_preference: v.value })}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold ${draft.chat_preference === v.value ? "bg-ubc text-white" : "bg-white text-muted ring-1 ring-ink/10"}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            ) : (
              vibeLabel(profile.chat_preference)
            )}
          </Field>
        </div>

        {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {editing && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => setEditing(false)} disabled={busy} className="btn-ghost">Cancel</button>
            <button onClick={save} disabled={busy || draft.full_name.trim().length < 2} className="btn-ubc">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        )}

        <div className="mt-4 border-t border-ink/5 pt-4 text-center">
          <Disclaimer />
        </div>
      </section>

      {/* Commute, car, licence */}
      <h2 className="mt-8 px-1 text-sm font-semibold text-muted">Commute</h2>
      <div className="card mt-2 divide-y divide-ink/5 px-4">
        <LinkRow
          href="/commute"
          icon={<Route size={18} aria-hidden />}
          title={c ? `${c.mode === "driver" ? "Driving" : "Riding"}${c.mode === "driver" && !c.active ? " · paused" : ""} from ${c.area ?? "home"}` : "Set up your commute"}
          sub={c ? `${c.days.length === 5 ? "Mon–Fri" : c.days.map((d) => DAY[d]).join(", ")} · ${shortCampus(c.campus)} by ${prettyTime(c.arriveBy)}` : "Where you live and when you need to be on campus"}
        />
        {c?.mode === "driver" && (
          <>
            <LinkRow href="/driver-verify" icon={<Car size={18} aria-hidden />} title="Car" sub={data.vehicle ?? "No car added yet"} />
            <LinkRow
              href="/driver-verify"
              icon={<IdCard size={18} aria-hidden />}
              title="Driver's licence"
              sub={{ verified: "Verified", pending: "Under review", rejected: "Needs a new photo", none: "Not verified yet" }[data.license]}
            />
          </>
        )}
      </div>

      <h2 className="mt-8 px-1 text-sm font-semibold text-muted">Account</h2>
      <div className="card mt-2 divide-y divide-ink/5 px-4">
        <LinkRow href={`/profile/${data.id}`} icon={<User size={18} aria-hidden />} title="Public profile" sub="How other commuters see you" />
        <LinkRow href="/wallet" icon={<Wallet size={18} aria-hidden />} title="Wallet" sub="Demo balance, top-ups and payouts" />
      </div>

      <div className="mt-4">
        <EnableNotifications />
      </div>

      <div className="mt-8">
        <SignOutButton />
      </div>
    </main>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-3">
      <span className="mt-0.5 text-ubc">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <div className="font-medium text-ink">{children}</div>
      </div>
    </div>
  );
}

function LinkRow({ href, icon, title, sub }: { href: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 py-3.5">
      <span className="text-ubc">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink">{title}</span>
        <span className="block truncate text-[13px] text-muted">{sub}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
    </Link>
  );
}
