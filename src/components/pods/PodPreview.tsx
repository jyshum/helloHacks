"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { BadgeCheck, CalendarX, GraduationCap, House, MessageCircle, Wallet as WalletIcon, MapPin, Timer, X } from "lucide-react";
import BaseMap from "@/components/app/BaseMap";
import PodRouteLine from "@/components/pods/PodRouteLine";
import Avatar from "@/components/Avatar";
import { prettyDuration, prettyTime } from "@/lib/pods/time";
import { shortCampus } from "@/lib/places";
import { formatCents, type Fare } from "@/lib/pricing";
import FareBreakdown from "@/components/trip/FareBreakdown";
import type { LatLng } from "@/lib/geo";

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

type Person = { id: string; full_name: string; photo_url: string | null; faculty: string | null; year: number | null };
type Preview = {
  podId: string;
  campus: string;
  campusPos: LatLng | null;
  driver: Person & { rating_avg: number; license_verified: boolean };
  car: { make_model: string; color: string; photo_url: string | null; is_ev: boolean } | null;
  reliability: { completed: number; total: number };
  riders: Person[];
  seatsLeft: number;
  fit: {
    days: number[];
    pickup: LatLng;
    pickupLabel: string;
    pickupTime: string;
    arriveBy: string;
    youNeed: string;
    driveMinutes: number;
    transitMinutes: number | null;
    detourMinutes: number;
  };
  routeStart: LatLng;
  fare: Fare;
  schedule: {
    day: number;
    state: "fit" | "off" | "none";
    arriveAt: string | null;
    homeLeave: string | null;
    ok: boolean;
    note: string | null;
    drives: boolean;
    pickupTime: string | null;
    arriveBy: string | null;
    youNeed: string | null;
    riders: number;
    stops: (LatLng & { me: boolean })[];
  }[];
  me: { faculty: string | null; year: number | null };
};

// Slide-up sheet: everything about one pod, before joining.
export default function PodPreview({
  podId,
  meName,
  mePhoto,
  joining,
  onJoin,
  onClose,
}: {
  podId: string;
  meName: string;
  mePhoto: string | null;
  joining: boolean;
  onJoin: () => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [showFare, setShowFare] = useState(false);
  // Slide down first, then unmount.
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 250);
  };

  useEffect(() => {
    fetch(`/api/pods/${podId}/preview`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => (ok ? setData(body) : setError(body.error ?? "Couldn't load this pod.")))
      .catch(() => setError("Couldn't load this pod."));
  }, [podId]);

  const today = data ? data.schedule.find((x) => x.day === day) ?? data.schedule.find((x) => x.ok) ?? data.schedule[0] : null;
  // You're only on the map on days you'd ride; other days show the pod without you.
  const meOff = today && !today.stops.some((st) => st.me) ? [{ id: "me", pos: data!.fit.pickup, kind: "rider" as const, name: meName, photo: mePhoto }] : [];
  const offDays = data ? data.schedule.filter((x) => x.state === "off") : [];
  const saved = data && data.fit.transitMinutes != null ? data.fit.transitMinutes - data.fit.driveMinutes : null;
  const sameFaculty = data ? data.riders.filter((r) => r.faculty && r.faculty === data.me.faculty).length + (data.driver.faculty === data.me.faculty ? 1 : 0) : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={close}>
      <div className={`absolute inset-0 bg-ink/25 ${closing ? "fade-out" : "fade-in"}`} aria-hidden />
      <div
        className={`relative mx-auto mt-auto flex h-[92dvh] w-full max-w-app flex-col overflow-hidden rounded-t-[32px] border border-white/70 bg-[#f7f9fc]/[0.97] shadow-lift backdrop-blur-2xl backdrop-saturate-150 ${closing ? "sheet-out" : "sheet-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Map: your pickup → campus */}
        <div className="relative h-[34%] shrink-0 overflow-hidden">
          {data && today && (
            <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
              <BaseMap
                pins={[
                  ...today.stops.map((st, i) =>
                    st.me
                      ? { id: "me", pos: { lat: st.lat, lng: st.lng }, kind: "rider" as const, name: meName, photo: mePhoto }
                      : { id: `s${i}`, pos: { lat: st.lat, lng: st.lng }, kind: "pickup" as const }
                  ),
                  ...meOff,
                  ...(data.campusPos ? [{ id: "campus", pos: data.campusPos, kind: "dropoff" as const }] : []),
                ]}
                fit={[...(today.drives ? [data.routeStart] : []), ...today.stops, ...meOff.map((m) => m.pos), ...(data.campusPos ? [data.campusPos] : [])]}
                bottomPadding={0}
                topPadding={40}
              >
                {data.campusPos && today.drives && <PodRouteLine start={data.routeStart} stops={today.stops} end={data.campusPos} />}
              </BaseMap>
            </APIProvider>
          )}
          <button onClick={close} className="glass absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full" aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-5">
          {error && <p className="rounded-2xl bg-red-50/80 px-4 py-3 text-sm text-red-700">{error}</p>}
          {!data && !error && <div className="h-40 animate-pulse rounded-card bg-ink/5" />}

          {data && (
            <div className="rise">
              {/* Driver */}
              <div className="flex items-center gap-3">
                <Link href={`/profile/${data.driver.id}`}>
                  <Avatar name={data.driver.full_name} photoUrl={data.driver.photo_url} size={56} />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-xl font-bold tracking-tight text-ink">
                    {data.driver.full_name.split(" ")[0]}
                    {data.driver.license_verified && <BadgeCheck size={18} className="text-blue" aria-label="Verified" />}
                  </p>
                  <p className="truncate text-[13px] text-muted">
                    ★ {data.driver.rating_avg.toFixed(1)}
                    {data.reliability.total > 0 && ` · showed up ${data.reliability.completed}/${data.reliability.total}`}
                    {data.car && ` · ${data.car.color} ${data.car.make_model}`}
                  </p>
                </div>
              </div>

              {saved != null && saved >= 5 && (
                <div className="mt-4 flex items-center justify-between rounded-2xl bg-green/10 px-4 py-3 text-green">
                  <span className="flex items-center gap-2 text-lg font-semibold">
                    <Timer size={19} aria-hidden /> {prettyDuration(saved)} saved
                  </span>
                  <span className="text-sm">Bus {prettyDuration(data.fit.transitMinutes!)} → {prettyDuration(data.fit.driveMinutes)}</span>
                </div>
              )}

              {/* Days the pod drives but at a time that doesn't suit you */}
              {offDays.length > 0 && (
                <div className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-amber-800">
                  <MessageCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
                  <p className="text-sm">
                    <span className="font-semibold">{offDays.map((x) => DAY[x.day]).join(", ")} {offDays.length === 1 ? "doesn't" : "don't"} fit your time.</span>{" "}
                    Join, then ask in the pod chat.
                  </p>
                </div>
              )}

              {/* Your ride: tap a day to see that day's times */}
              <div className="card mt-4 px-4 pb-1 pt-4">
                <div className="flex gap-1.5">
                  {data.schedule.map(({ day: d, ok, state }) => {
                    const on = today?.day === d;
                    return (
                      <button
                        key={d}
                        onClick={() => setDay(d)}
                        className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
                          on
                            ? ok
                              ? "bg-ubc text-white shadow-glow"
                              : state === "off"
                                ? "bg-amber-500 text-white"
                                : "bg-ink/60 text-white"
                            : ok
                              ? "bg-ubc/10 text-ubc"
                              : state === "off"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-ink/[0.04] text-muted/60"
                        }`}
                        aria-pressed={on}
                      >
                        {DAY[d]}
                      </button>
                    );
                  })}
                </div>
                {today && today.ok && today.pickupTime && today.arriveBy && (
                  <div className="mt-2 divide-y divide-ink/5">
                    <Line icon={<MapPin size={18} aria-hidden />} title={`Pickup ${prettyTime(today.pickupTime)}`} sub={data.fit.pickupLabel} />
                    <Line
                      icon={<GraduationCap size={18} aria-hidden />}
                      title={`${shortCampus(data.campus)} at ${prettyTime(today.arriveAt ?? today.arriveBy)}`}
                      sub={`${prettyDuration(data.fit.driveMinutes)} ride${today.youNeed ? ` · class at ${prettyTime(today.youNeed)}` : ""}`}
                    />
                    {today.homeLeave && (
                      <Line icon={<House size={18} aria-hidden />} title={`Ride home ${prettyTime(today.homeLeave)}`} sub="Optional · tap in on the days you need it" />
                    )}
                    <button onClick={() => setShowFare((s) => !s)} className="w-full text-left" aria-expanded={showFare}>
                      <Line icon={<WalletIcon size={18} aria-hidden />} title={`${formatCents(data.fare.total)} a ride`} sub={showFare ? "Paid from your wallet on arrival" : "Tap for breakdown"} />
                    </button>
                    {showFare && (
                      <div className="pb-3">
                        <FareBreakdown fare={data.fare} />
                      </div>
                    )}
                    <p className="py-3 text-[13px] text-muted">
                      {today.riders ? `${today.riders + 1} riders this day` : "Just you and the driver this day"}
                    </p>
                  </div>
                )}
                {today && !today.ok && (
                  <div className="mt-2 divide-y divide-ink/5">
                    <Line icon={<CalendarX size={18} aria-hidden />} title={today.note ?? "Not your day"} />
                    {today.arriveBy && (
                      <Line
                        icon={<GraduationCap size={18} aria-hidden />}
                        title={`${shortCampus(data.campus)} by ${prettyTime(today.arriveBy)}`}
                        sub={today.youNeed ? `Your class: ${prettyTime(today.youNeed)}` : undefined}
                      />
                    )}
                    <p className="py-3 text-[13px] text-muted">
                      {!today.drives ? "No ride this day" : today.riders ? `${today.riders} rider${today.riders === 1 ? "" : "s"} this day` : "Just the driver this day"}
                    </p>
                  </div>
                )}
              </div>

              {/* Who's in */}
              <div className="mt-5 flex items-baseline justify-between">
                <p className="font-semibold text-ink">Who&apos;s in</p>
                <p className="text-[13px] text-muted">
                  {sameFaculty > 0 ? `${sameFaculty} in ${data.me.faculty}` : `${data.seatsLeft} seat${data.seatsLeft === 1 ? "" : "s"} open`}
                </p>
              </div>
              <div className="no-scrollbar mt-3 flex gap-4 overflow-x-auto">
                <Face p={data.driver} driver highlight={data.driver.faculty === data.me.faculty} />
                {data.riders.map((r) => (
                  <Face key={r.id} p={r} highlight={!!r.faculty && r.faculty === data.me.faculty} />
                ))}
                {data.riders.length === 0 && <p className="self-center text-sm text-muted">Be the first rider</p>}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/60 bg-white/60 px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3 backdrop-blur-xl">
          <button onClick={onJoin} disabled={!data || joining} className="btn-ubc w-full py-4 text-lg">
            {joining ? "Joining…" : "Join"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Line({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="text-muted">{icon}</span>
      <div className="min-w-0">
        <p className="font-semibold text-ink">{title}</p>
        {sub && <p className="truncate text-[13px] text-muted">{sub}</p>}
      </div>
    </div>
  );
}

function Face({ p, driver, highlight }: { p: Person; driver?: boolean; highlight?: boolean }) {
  return (
    <Link href={`/profile/${p.id}`} className="flex w-16 shrink-0 flex-col items-center text-center">
      <Avatar name={p.full_name} photoUrl={p.photo_url} size={48} tone={driver ? "driver" : "rider"} />
      <span className="mt-1.5 w-full truncate text-xs font-semibold text-ink">{p.full_name.split(" ")[0]}</span>
      <span className={`w-full truncate text-[11px] ${highlight ? "font-semibold text-green" : "text-muted"}`}>
        {[p.faculty?.split(" ")[0], p.year && `Y${p.year}`].filter(Boolean).join(" · ") || (driver ? "Driver" : "")}
      </span>
    </Link>
  );
}
