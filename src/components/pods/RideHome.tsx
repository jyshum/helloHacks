"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, House, X } from "lucide-react";
import InOut from "@/components/pods/InOut";
import BaseMap from "@/components/app/BaseMap";
import PodRouteLine from "@/components/pods/PodRouteLine";
import Avatar from "@/components/Avatar";
import { shortCampus } from "@/lib/places";
import { fromMinutes, leaveOn, nextDateOn, pickupOn, prettyDate, prettyTime } from "@/lib/pods/time";
import type { Weekday } from "@/lib/pods/types";
import type { MemberView, PodView } from "@/lib/pods/load";

const DAY_NAME = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const first = (n: string) => n.split(" ")[0];

// The afternoon half of a pod: the driver heads home and riders tap in on the days they need it.
// Tapping the card shows the route from campus past each drop-off, with everyone's "home by" time.
export default function RideHome({
  view,
  day,
  isDriver,
  busy,
  call,
}: {
  view: PodView;
  day: number;
  isDriver: boolean;
  busy: boolean;
  call: (url: string, body?: object, method?: string) => Promise<unknown>;
}) {
  const { pod, driverProfile, riders, homeRides, routeStart } = view;
  const mine = view.me!;
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [legs, setLegs] = useState<number[] | null>(null);

  const leave = leaveOn(driverProfile, day as Weekday);
  if (view.paused) return null;
  if (leave == null || !driverProfile.days.includes(day as Weekday)) {
    if (!isDriver) return null;
    return (
      <Link href="/commute" className="mt-4 flex items-center justify-center gap-1.5 text-sm font-semibold text-blue">
        <House size={14} aria-hidden /> Drive your riders home too
      </Link>
    );
  }

  const date = nextDateOn([day as Weekday], leave)!;
  const going = new Set(homeRides.filter((h) => h.trip_date === date).map((h) => h.user_id));
  const canRide = !isDriver && (mine.days as number[]).includes(day);
  const imIn = going.has(mine.user_id);
  const campus = { lat: pod.campus_lat, lng: pod.campus_lng };

  // Drop-offs: riders going home that day (plus me, as a preview, if I'm not in yet),
  // in reverse morning order so the nearest-to-campus stop comes first.
  const riding = riders
    .filter((m) => m.pickup_lat != null && (going.has(m.user_id) || (m.user_id === mine.user_id && canRide)))
    .map((m) => ({ m, t: pickupOn(m.pickup_time, driverProfile, m.days as number[], day) ?? "00:00" }))
    .sort((a, b) => b.t.localeCompare(a.t))
    .map((x) => x.m);
  const stops = riding.map((m) => ({ lat: m.pickup_lat!, lng: m.pickup_lng! }));
  const homeBy = (m: MemberView) => {
    if (!legs) return null;
    const i = riding.indexOf(m);
    const mins = legs.slice(0, i + 1).reduce((s, x) => s + x, 0) + i; // +1 min per earlier drop-off
    return fromMinutes(leave + mins);
  };
  const me = riding.find((m) => m.user_id === mine.user_id);
  const others = Array.from(going).filter((id) => id !== mine.user_id).length;

  const setIn = (next: boolean) => call(`/api/pods/${pod.id}/home`, { date }, next ? "POST" : "DELETE");
  const close = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 250);
  };

  return (
    <>
      <div role="button" tabIndex={0} onClick={() => setOpen(true)} onKeyDown={(e) => e.key === "Enter" && setOpen(true)} className="card mt-4 cursor-pointer p-4 transition active:scale-[0.99]">
        <div className="flex items-center gap-3">
        <span className="row-icon"><House size={18} aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">Ride home · {prettyTime(fromMinutes(leave))}</span>
          <span className="block truncate text-[13px] text-muted">
            {isDriver
              ? going.size ? `${going.size} riding home ${prettyDate(date)}` : `Leave ${shortCampus(pod.campus_label)} · no one yet`
              : `${prettyDate(date)} · ${imIn ? "you're in" : "tap to see the route"}`}
          </span>
        </span>
        <ChevronRight size={18} className="text-muted" aria-hidden />
        </div>
        {canRide && <InOut isIn={imIn} busy={busy} onChange={setIn} />}
      </div>

      {/* At the page root: the pod panel animates in, which would trap a fixed overlay. */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col" onClick={close}>
          <div className={`absolute inset-0 bg-ink/25 ${closing ? "fade-out" : "fade-in"}`} aria-hidden />
          <div
            className={`relative mx-auto mt-auto flex h-[88dvh] w-full max-w-app flex-col overflow-hidden rounded-t-[32px] border border-white/70 bg-[#f7f9fc] shadow-lift ${closing ? "sheet-out" : "sheet-in"}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Ride home"
          >
            <div className="relative h-[42%] shrink-0">
              <BaseMap
                pins={[
                  { id: "campus", pos: campus, kind: "dropoff" as const },
                  ...riding.map((m) => ({ id: m.id, pos: { lat: m.pickup_lat!, lng: m.pickup_lng! }, kind: "rider" as const, name: m.user.full_name, photo: m.user.photo_url })),
                ]}
                fit={[campus, ...stops, routeStart]}
                bottomPadding={0}
                topPadding={40}
              >
                <PodRouteLine start={campus} stops={stops} end={routeStart} onLegs={setLegs} />
              </BaseMap>
              <button onClick={close} className="glass absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full" aria-label="Close">
                <X size={18} aria-hidden />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-6 pt-5">
              <p className="text-sm font-medium text-muted">Ride home · {prettyDate(date)}</p>
              <h2 className="mt-1 text-[26px] font-bold leading-tight text-ubc">
                {me && homeBy(me) ? `Home by ${prettyTime(homeBy(me))}` : `Leave ${shortCampus(pod.campus_label)} ${prettyTime(fromMinutes(leave))}`}
              </h2>
              <p className="mt-1 text-[15px] text-muted">
                {me ? `Leave ${shortCampus(pod.campus_label)} ${prettyTime(fromMinutes(leave))} with ${first(view.driver.user.full_name)}` : `${going.size || "No"} ${going.size === 1 ? "rider" : "riders"} so far`}
              </p>

              <div className="card mt-4 divide-y divide-ink/5 px-4">
                {riding.length === 0 && <p className="py-4 text-sm text-muted">No one has tapped in yet.</p>}
                {riding.map((m) => (
                  <div key={m.id} className={`flex items-center gap-3 py-3 ${going.has(m.user_id) ? "" : "opacity-60"}`}>
                    <Avatar name={m.user.full_name} photoUrl={m.user.photo_url} size={36} tone="rider" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{m.user_id === mine.user_id ? "You" : first(m.user.full_name)}</span>
                      <span className="block truncate text-[13px] text-muted">{m.area ?? "Home"}{going.has(m.user_id) ? "" : " · if you tap in"}</span>
                    </span>
                    <span className="text-sm font-semibold text-ink">{homeBy(m) ? prettyTime(homeBy(m)) : "…"}</span>
                  </div>
                ))}
              </div>
              {!isDriver && others > 0 && !imIn && <p className="mt-3 text-[13px] text-muted">{others} already riding home this day.</p>}
            </div>

            {canRide && (
              <div className="shrink-0 border-t border-white/60 bg-white/60 px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3">
                <button onClick={() => setIn(!imIn)} disabled={busy} className={`${imIn ? "btn-ghost" : "btn-ubc"} w-full py-4 text-lg`}>
                  {imIn ? "Don't need a ride" : `I'm in for ${DAY_NAME[day]}`}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
