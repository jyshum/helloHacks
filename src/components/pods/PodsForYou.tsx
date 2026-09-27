"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Car, Pencil, Search, Timer, Zap } from "lucide-react";
import ProfileMenu, { type MenuUser } from "@/components/app/ProfileMenu";
import Avatar from "@/components/Avatar";
import { prettyTime } from "@/lib/pods/time";
import type { PodCard } from "@/app/api/pods/options/route";

const DAY = ["", "M", "T", "W", "T", "F"];

export default function PodsForYou({ me, area, arriveBy }: { me: MenuUser; area: string; arriveBy: string }) {
  const router = useRouter();
  const [pods, setPods] = useState<PodCard[] | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pods/options", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setPods(b.pods ?? []))
      .catch(() => setPods([]));
  }, []);

  async function join(podId: string) {
    setJoining(podId);
    setError(null);
    const res = await fetch(`/api/pods/${podId}/join`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setJoining(null);
      return setError(body.error ?? "Couldn't join.");
    }
    router.push(`/pods/${podId}`);
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

      <h1 className="mt-8 text-[34px] font-bold leading-none text-ubc">Pods for you</h1>
      <p className="mt-2 text-muted">
        {area} <span className="mx-1 text-muted/50">→</span> UBC · {prettyTime(arriveBy)}
      </p>

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
            <div key={p.podId} className="card rise p-5" style={{ animationDelay: `${i * 70}ms` }}>
              <div className="flex items-center gap-3">
                <Link href={`/profile/${p.driver.id}`} className="relative">
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

              <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((d) => (
                    <span
                      key={d}
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                        p.days.includes(d) ? "bg-ubc text-white" : "bg-ink/5 text-muted/60"
                      }`}
                    >
                      {DAY[d]}
                    </span>
                  ))}
                </div>
                <span className="text-[15px] font-semibold text-ink">{prettyTime(p.pickupTime)}</span>
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

              <button onClick={() => join(p.podId)} disabled={!!joining} className="btn-ubc mt-4 w-full">
                {joining === p.podId ? "Joining…" : "Join"}
              </button>
            </div>
          );
        })}

        {pods?.length === 0 && (
          <div className="card rise flex flex-col items-center p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/80 text-ubc shadow-soft">
              <Search size={24} aria-hidden />
            </span>
            <p className="mt-4 text-lg font-semibold text-ink">No pods yet</p>
            <p className="mt-1 text-sm text-muted">We&apos;ll let you know.</p>
          </div>
        )}
      </div>

      <Link href="/map" className="mx-auto mt-8 flex w-fit items-center gap-1.5 text-sm font-semibold text-blue">
        <Zap size={15} aria-hidden /> Ride today
      </Link>
    </main>
  );
}
