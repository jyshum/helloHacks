"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, Car, ChevronRight, Pencil, Search, Timer } from "lucide-react";
import PodPreview from "@/components/pods/PodPreview";
import { shortCampus } from "@/lib/places";
import ProfileMenu, { type MenuUser } from "@/components/app/ProfileMenu";
import Avatar from "@/components/Avatar";
import { prettyTime } from "@/lib/pods/time";
import type { PodCard } from "@/app/api/pods/options/route";

const DAY = ["", "M", "T", "W", "T", "F"];
const DAY_NAME = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

export type MyPod = { podId: string; status: "active" | "requested" | "paused"; days: number[]; campus: string; arriveBy: string | null; varies: boolean; driver: { id: string; full_name: string; photo_url: string | null } };

type Props = { me: MenuUser; area: string; arriveBy: string; myPods: MyPod[]; openDays: number[] };

export default function PodsForYou({ me, area, arriveBy, myPods, openDays }: Props) {
  const router = useRouter();
  const [pods, setPods] = useState<PodCard[] | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-fetch whenever the days still needing a pod change (e.g. right after joining one).
  const openKey = openDays.join(",");
  const myKey = myPods.map((p) => p.podId).join(",");
  useEffect(() => {
    if (!openKey) return setPods([]);
    setPods(null);
    fetch("/api/pods/options", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setPods(b.pods ?? []))
      .catch(() => setPods([]));
  }, [openKey, myKey]);

  async function join(podId: string) {
    setJoining(podId);
    setError(null);
    const res = await fetch(`/api/pods/${podId}/join`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setJoining(null);
      return setError(body.error ?? "Couldn't join.");
    }
    setJoining(null);
    setPreview(null);
    router.refresh();
  }

  return (
    <main className="screen pb-16">
      <div className="flex items-center justify-between">
        <ProfileMenu me={me} mode="rider" />
        <Link href="/commute" className="glass flex h-11 w-11 items-center justify-center rounded-full" aria-label="Edit commute">
          <Pencil size={17} aria-hidden />
        </Link>
      </div>

      {myPods.length > 0 && (
        <>
          <h1 className="mt-8 text-[34px] font-bold leading-none text-ubc">My pods</h1>
          <div className="mt-5 flex flex-col gap-3">
            {myPods.map((p) => (
              <Link key={p.podId} href={`/pods/${p.podId}`} className="card rise flex items-center gap-3 p-4">
                <span className="relative">
                  <Avatar name={p.driver.full_name} photoUrl={p.driver.photo_url} size={46} />
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-ubc text-white">
                    <Car size={11} aria-hidden />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">{p.driver.full_name.split(" ")[0]}&apos;s pod</span>
                  <span className="block text-[13px] text-muted">
                    {p.days.map((d) => DAY_NAME[d]).join(", ")}
                    {p.arriveBy && (p.varies ? ` · ${shortCampus(p.campus)} · times vary` : ` · ${shortCampus(p.campus)} by ${prettyTime(p.arriveBy)}`)}
                    {p.status === "requested" && " · Pending"}
                    {p.status === "paused" && " · Paused by driver"}
                  </span>
                </span>
                <ChevronRight size={18} className="text-muted" aria-hidden />
              </Link>
            ))}
          </div>
        </>
      )}

      {openDays.length > 0 && (
        <>
          <h1 className={`${myPods.length ? "mt-10 text-2xl" : "mt-8 text-[34px]"} font-bold leading-none text-ubc`}>Pods for you</h1>
          <p className="mt-2 text-muted">
            {myPods.length ? openDays.map((d) => DAY_NAME[d]).join(", ") : <>{area} <span className="mx-1 text-muted/50">→</span> UBC · {prettyTime(arriveBy)}</>}
          </p>
          <Link href="/people?role=driver" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue">
            <Search size={14} aria-hidden /> Search all drivers
          </Link>
        </>
      )}

      {error && <p className="mt-4 rounded-2xl bg-red-50/80 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 flex flex-col gap-4">
        {pods === null &&
          [0, 1, 2].map((i) => (
            <div key={i} className="card h-[188px] animate-pulse p-5" style={{ animationDelay: `${i * 120}ms` }}>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-ink/5" />
                <div className="h-4 w-32 rounded-full bg-ink/5" />
              </div>
            </div>
          ))}

        {pods?.map((p, i) => {
          const saved = p.transitMinutes != null ? p.transitMinutes - p.driveMinutes : null;
          return (
            <div
              key={p.podId}
              role="button"
              tabIndex={0}
              onClick={() => setPreview(p.podId)}
              onKeyDown={(e) => e.key === "Enter" && setPreview(p.podId)}
              className="card rise cursor-pointer p-5 transition active:scale-[0.99]"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex items-center gap-3">
                <Link href={`/profile/${p.driver.id}`} onClick={(e) => e.stopPropagation()} className="relative">
                  <Avatar name={p.driver.full_name} photoUrl={p.driver.photo_url} size={52} />
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-ubc text-white">
                    <Car size={11} aria-hidden />
                  </span>
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-[17px] font-semibold text-ink">
                    {p.driver.full_name.split(" ")[0]}
                    {p.driver.license_verified && <BadgeCheck size={16} className="shrink-0 text-blue" aria-label="Verified" />}
                  </p>
                  <p className="truncate text-[13px] text-muted">{p.car ? `${p.car.color} ${p.car.make_model}` : p.driver.faculty}</p>
                </div>
                {saved != null && saved >= 5 ? (
                  <span className="flex items-center gap-1 rounded-full bg-green/10 px-3 py-1.5 text-sm font-semibold text-green">
                    <Timer size={14} aria-hidden /> {saved} min
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-muted">{p.driveMinutes} min</span>
                )}
              </div>

              {/* Your week with this pod: blue fits, amber drives but the time is off, grey no ride */}
              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  {(p.week.length ? p.week : [1, 2, 3, 4, 5].map((d) => ({ day: d, state: p.days.includes(d) ? "fit" : "none", gap: null }))).map((w) => (
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
                {offLabel(p) ? (
                  <span className="chip whitespace-nowrap bg-amber-100 text-amber-700">{offLabel(p)}</span>
                ) : (
                  p.varies && <span className="chip whitespace-nowrap bg-ink/5 text-muted">Times vary</span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]">
                <span className="whitespace-nowrap">
                  <span className="font-semibold text-ink">{prettyTime(p.pickupTime)}</span> <span className="text-muted">pickup</span>
                </span>
                <ArrowRight size={15} className="text-muted/60" aria-hidden />
                <span className="whitespace-nowrap">
                  <span className="font-semibold text-ink">{shortCampus(p.campus)}</span> <span className="text-muted">by {prettyTime(p.arriveBy)}</span>
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex -space-x-2">
                    {p.riders.slice(0, 4).map((r) => (
                      <Avatar key={r.id} name={r.full_name} photoUrl={r.photo_url} size={28} tone="rider" />
                    ))}
                  </div>
                  <span className="ml-2 text-[13px] text-muted">
                    {p.riders.length ? `${p.riders.length} in` : "Be first"} · {p.seatsLeft} open
                  </span>
                </div>
                {p.invited && <span className="chip bg-sky/15 text-blue">Invited you</span>}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  join(p.podId);
                }}
                disabled={!!joining}
                className="btn-ubc mt-4 w-full"
              >
                {joining === p.podId ? "Joining…" : "Join"}
              </button>
            </div>
          );
        })}

        {pods?.length === 0 && openDays.length > 0 && (
          <div className="card rise flex flex-col items-center p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/80 text-ubc shadow-soft">
              <Search size={24} aria-hidden />
            </span>
            <p className="mt-4 text-lg font-semibold text-ink">No pods yet</p>
            <p className="mt-1 text-sm text-muted">We&apos;ll let you know.</p>
          </div>
        )}
      </div>

      {preview && (
        <PodPreview
          podId={preview}
          meName={me.full_name}
          mePhoto={me.photo_url}
          joining={joining === preview}
          onJoin={() => join(preview)}
          onClose={() => setPreview(null)}
        />
      )}

    </main>
  );
}

// "Fri 15 min late" for the one day whose time doesn't fit, or "2 days off" for more.
function offLabel(p: PodCard): string | null {
  const off = p.week.filter((w) => w.state === "off");
  if (!off.length) return null;
  if (off.length > 1) return `${off.length} days off`;
  const g = off[0].gap ?? 0;
  return `${DAY_NAME[off[0].day]} ${Math.abs(g)} min ${g > 0 ? "late" : "early"}`;
}
