"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { APIProvider } from "@vis.gl/react-google-maps";
import { AlertTriangle, BadgeCheck, Car, Check, ChevronRight, Clock, MessageCircle, Navigation, Pencil, Plus, Timer, X, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BaseMap from "@/components/app/BaseMap";
import ProfileMenu, { type MenuUser } from "@/components/app/ProfileMenu";
import Avatar from "@/components/Avatar";
import SharedBadge from "@/components/SharedBadge";
import EnableNotifications from "@/components/pods/EnableNotifications";
import { decodePolyline, type LatLng } from "@/lib/geo";
import { dayWord, prettyDate, prettyTime, toMinutes, vancouverNow } from "@/lib/pods/time";

import type { MemberView, PodView } from "@/lib/pods/load";

type Props = { view: PodView; me: MenuUser; meFaculty: string | null; meYear: number | null };

const DAY = ["", "M", "T", "W", "T", "F"];
const first = (n: string) => n.split(" ")[0];

export default function PodScreen(props: Props) {
  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      <Screen {...props} />
    </APIProvider>
  );
}

function Screen({ view, me, meFaculty, meYear }: Props) {
  const router = useRouter();
  const { pod, driver, driverProfile, vehicle, riders, requests, nextTrip } = view;
  const mine = view.me!;
  const isDriver = mine.role === "driver";
  const inPod = isDriver || mine.status === "active";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live: membership changes and trip status push a refresh; poll as a fallback.
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`pod-${pod.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pod_members", filter: `pod_id=eq.${pod.id}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "pod_trips", filter: `pod_id=eq.${pod.id}` }, () => router.refresh())
      .subscribe();
    const t = setInterval(() => router.refresh(), 20000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, [pod.id, router]);

  async function call(url: string, body?: object, method = "POST") {
    setBusy(url + JSON.stringify(body ?? {}));
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return null;
    }
    router.refresh();
    return data;
  }

  const route = useMemo(() => (driverProfile.route_polyline ? decodePolyline(driverProfile.route_polyline) : []), [driverProfile.route_polyline]);
  const campus = { lat: pod.campus_lat, lng: pod.campus_lng };
  const pickups = [...riders, ...(mine.status !== "active" && mine.role === "rider" ? [mine] : [])].filter((m) => m.pickup_lat != null);
  const fit: LatLng[] = route.length ? [route[0], campus] : [campus];
  const driverName = first(driver.user.full_name);
  const shown = view.reliability.completed + view.reliability.missed;

  return (
    <div className="relative min-h-[100dvh]">
      {/* Map with everyone's face at their pickup spot */}
      <div className="relative h-[40dvh] w-full overflow-hidden">
        <BaseMap
          pins={[
            ...pickups.map((m) => ({ id: m.id, pos: { lat: m.pickup_lat!, lng: m.pickup_lng! }, kind: "rider" as const, name: m.user.full_name, photo: m.user.photo_url })),
            { id: "campus", pos: campus, kind: "dropoff" as const },
          ]}
          routes={route.length ? [{ id: "route", path: route, color: "#0055B7", opacity: 0.85, weight: 5 }] : []}
          fit={fit}
          bottomPadding={40}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto flex max-w-app items-center justify-between p-4">
          <ProfileMenu me={me} mode={isDriver ? "driver" : "rider"} />
          <div className="pointer-events-auto flex gap-2">
            {inPod && (
              <Link href={`/pods/${pod.id}/chat`} className="glass flex h-11 w-11 items-center justify-center rounded-full text-ubc" aria-label="Pod chat">
                <MessageCircle size={19} aria-hidden />
              </Link>
            )}
            <Link href="/commute" className="glass flex h-11 w-11 items-center justify-center rounded-full text-ubc" aria-label="Edit commute">
              <Pencil size={17} aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      <main className="glass relative z-10 mx-auto -mt-8 min-h-[64dvh] w-full max-w-app rounded-t-[32px] border-b-0 bg-white/65 px-5 pb-14 pt-6">
        {error && <p className="mb-4 rounded-2xl bg-red-50/80 px-4 py-3 text-sm text-red-700">{error}</p>}

        {!isDriver && mine.status === "invited" && (
          <InviteCard
            view={view}
            mine={mine}
            me={{ faculty: meFaculty, year: meYear }}
            busy={!!busy}
            onJoin={() => call(`/api/pods/${pod.id}/join`)}
            onDecline={async () => {
              const r = await call(`/api/pods/${pod.id}/decline-invite`);
              if (r) router.push("/pods");
            }}
          />
        )}

        {!isDriver && mine.status === "requested" && (
          <div className="rise flex flex-col items-center py-6 text-center">
            <span className="relative">
              <span className="absolute inset-0 animate-ping rounded-full bg-sky/25" />
              <Avatar name={driver.user.full_name} photoUrl={driver.user.photo_url} size={72} />
            </span>
            <h1 className="mt-5 text-2xl font-semibold text-ubc">Asked {driverName}</h1>
            <p className="mt-1 text-sm text-muted">You&apos;ll hear back soon.</p>
            <button onClick={() => call(`/api/pods/${pod.id}/leave`)} className="mt-6 text-sm font-semibold text-muted">Cancel</button>
          </div>
        )}

        {inPod && (
          <div className="rise">
            <h1 className="text-[28px] font-bold leading-tight text-ubc">
              {driverProfile.home_area ?? "Home"} <span className="text-muted/50">→</span> UBC
            </h1>
            <div className="mt-3 flex items-center justify-between">
              <DayDots days={driverProfile.days} />
              <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                <Clock size={15} className="text-muted" aria-hidden /> {prettyTime(driverProfile.arrive_by)}
              </span>
            </div>

            {nextTrip && <TripCard view={view} isDriver={isDriver} busy={busy} call={call} />}

            {/* Members */}
            <div className="card mt-4 p-4">
              <div className="no-scrollbar flex gap-4 overflow-x-auto">
                <Person m={driver} label={isDriver ? "You" : driverName} driver />
                {riders.map((m) => (
                  <Person key={m.id} m={m} label={m.user_id === mine.user_id ? "You" : first(m.user.full_name)} />
                ))}
                {isDriver &&
                  Array.from({ length: Math.max(0, view.seatsLeft) }).map((_, i) => (
                    <div key={i} className="flex w-14 shrink-0 flex-col items-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-ink/15 text-muted">
                        <Plus size={16} aria-hidden />
                      </span>
                      <span className="mt-1.5 text-xs text-muted">Open</span>
                    </div>
                  ))}
              </div>
              {shown > 0 && (
                <p className="mt-3 border-t border-ink/5 pt-3 text-[13px] text-muted">
                  {driverName} showed up <b className="text-ink">{view.reliability.completed}/{shown}</b>
                </p>
              )}
            </div>

            {isDriver && requests.length > 0 && (
              <div className="mt-4 flex flex-col gap-3">
                {requests.map((r) => (
                  <ApprovalCard key={r.id} r={r} me={{ faculty: meFaculty, year: meYear }} busy={!!busy} onDecide={(action) => call(`/api/pods/${pod.id}/members/${r.id}`, { action })} />
                ))}
              </div>
            )}

            <Link href={`/pods/${pod.id}/chat`} className="card mt-4 flex items-center gap-3 p-4">
              <span className="row-icon"><MessageCircle size={18} aria-hidden /></span>
              <span className="flex-1 font-semibold text-ink">Chat</span>
              <ChevronRight size={18} className="text-muted" aria-hidden />
            </Link>

            <div className="mt-3">
              <EnableNotifications variant="banner" />
            </div>

            {isDriver && (!vehicle || !driver.user.license_verified) && (
              <Link href="/driver-verify" className="card mt-3 flex items-center gap-3 p-4">
                <span className="row-icon"><BadgeCheck size={18} aria-hidden /></span>
                <span className="flex-1 font-semibold text-ink">Get verified</span>
                <ChevronRight size={18} className="text-muted" aria-hidden />
              </Link>
            )}

            <div className="mt-10 flex items-center justify-center gap-6 text-sm">
              <Link href="/map" className="flex items-center gap-1.5 font-semibold text-blue">
                <Zap size={14} aria-hidden /> Ride today
              </Link>
              <button
                onClick={async () => {
                  if (!confirm(isDriver ? "Stop driving this pod?" : "Leave this pod?")) return;
                  const r = await call(`/api/pods/${pod.id}/leave`);
                  if (r) router.push("/pods");
                }}
                className="font-semibold text-muted"
              >
                {isDriver ? "Stop driving" : "Leave pod"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------------

function DayDots({ days }: { days: number[] }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((d) => (
        <span
          key={d}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${days.includes(d) ? "bg-ubc text-white" : "bg-ink/5 text-muted/60"}`}
        >
          {DAY[d]}
        </span>
      ))}
    </div>
  );
}

function Person({ m, label, driver }: { m: MemberView; label: string; driver?: boolean }) {
  return (
    <Link href={`/profile/${m.user_id}`} className="flex w-14 shrink-0 flex-col items-center">
      <span className="relative">
        <Avatar name={m.user.full_name} photoUrl={m.user.photo_url} size={48} tone={driver ? "driver" : "rider"} />
        {driver && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-ubc text-white">
            <Car size={11} aria-hidden />
          </span>
        )}
      </span>
      <span className="mt-1.5 w-full truncate text-center text-xs font-medium text-ink">{label}</span>
    </Link>
  );
}

function TimeSaved({ transit, drive }: { transit: number | null; drive: number | null }) {
  if (transit == null || drive == null || transit - drive < 5) return null;
  return (
    <div className="flex items-center justify-between rounded-2xl bg-green/10 px-4 py-3 text-green">
      <span className="flex items-center gap-2 font-semibold">
        <Timer size={18} aria-hidden /> {transit - drive} min saved
      </span>
      <span className="text-sm">
        {transit} → {drive} min
      </span>
    </div>
  );
}

function InviteCard({
  view,
  mine,
  me,
  busy,
  onJoin,
  onDecline,
}: {
  view: PodView;
  mine: MemberView;
  me: { faculty: string | null; year: number | null };
  busy: boolean;
  onJoin: () => void;
  onDecline: () => void;
}) {
  const { driver, vehicle, riders, driverProfile } = view;
  return (
    <div className="rise">
      <div className="flex items-center gap-4">
        <Link href={`/profile/${driver.user_id}`}>
          <Avatar name={driver.user.full_name} photoUrl={driver.user.photo_url} size={64} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-2xl font-bold text-ink">
            {first(driver.user.full_name)}
            {driver.user.license_verified && <BadgeCheck size={20} className="text-blue" aria-label="Verified" />}
          </p>
          <p className="truncate text-sm text-muted">{vehicle ? `${vehicle.color} ${vehicle.make_model}` : driver.user.faculty}</p>
        </div>
      </div>
      <div className="mt-3">
        <SharedBadge a={me} b={driver.user} />
      </div>
      <div className="mt-4">
        <TimeSaved transit={mine.transit_minutes} drive={mine.drive_minutes} />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <DayDots days={mine.days} />
        <span className="text-[15px] font-semibold text-ink">{prettyTime(mine.pickup_time)}</span>
      </div>
      <p className="mt-2 text-sm text-muted">{mine.pickup_label}</p>
      {riders.length > 0 && (
        <div className="mt-4 flex -space-x-2">
          {riders.map((r) => (
            <Avatar key={r.id} name={r.user.full_name} photoUrl={r.user.photo_url} size={30} tone="rider" />
          ))}
        </div>
      )}
      <div className="mt-6 grid grid-cols-[1fr_1.8fr] gap-2">
        <button onClick={onDecline} disabled={busy} className="btn-ghost">Pass</button>
        <button onClick={onJoin} disabled={busy} className="btn-ubc">Join</button>
      </div>
      <p className="mt-3 text-center text-xs text-muted">{driverProfile.campus_label}</p>
    </div>
  );
}

function ApprovalCard({
  r,
  me,
  busy,
  onDecide,
}: {
  r: MemberView;
  me: { faculty: string | null; year: number | null };
  busy: boolean;
  onDecide: (a: "approve" | "decline") => void;
}) {
  return (
    <div className="card rise p-4">
      <div className="flex items-center gap-3">
        <Link href={`/profile/${r.user_id}`}>
          <Avatar name={r.user.full_name} photoUrl={r.user.photo_url} size={48} tone="rider" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{r.user.full_name}</p>
          <p className="text-[13px] text-muted">
            ★ {Number(r.user.rating_avg ?? 5).toFixed(1)} · {r.area ?? r.user.faculty} · +{Math.round(Number(r.detour_minutes ?? 0))} min
          </p>
        </div>
      </div>
      <div className="mt-2">
        <SharedBadge a={me} b={r.user} />
      </div>
      <div className="mt-3 grid grid-cols-[1fr_1.8fr] gap-2">
        <button onClick={() => onDecide("decline")} disabled={busy} className="btn-ghost py-3">Decline</button>
        <button onClick={() => onDecide("approve")} disabled={busy} className="btn-ubc py-3">Approve</button>
      </div>
    </div>
  );
}

// The next commute day: confirm / skip / start / track, plus late and no-show handling.
function TripCard({
  view,
  isDriver,
  busy,
  call,
}: {
  view: PodView;
  isDriver: boolean;
  busy: string | null;
  call: (url: string, body?: object, method?: string) => Promise<unknown>;
}) {
  const trip = view.nextTrip!;
  const { pod, driver, riders } = view;
  const mine = view.me!;
  const driverName = first(driver.user.full_name);
  const when = prettyDate(trip.date);
  const day = dayWord(trip.date);
  const isToday = trip.date === vancouverNow().date;
  const skipping = trip.skippedUserIds.includes(mine.user_id);
  const coming = riders.filter((r) => !trip.skippedUserIds.includes(r.user_id));
  const firstPickup = coming.map((r) => r.pickup_time).filter(Boolean).sort()[0] ?? null;
  const url = `/api/pods/${pod.id}/trip`;

  // Re-render every 30s so late/no-show banners appear on time.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const pickupMins = isToday && mine.pickup_time ? toMinutes(mine.pickup_time) - vancouverNow().minutes : null;
  const waiting = !["live", "completed", "cancelled", "missed"].includes(trip.status);
  const late = !isDriver && !skipping && waiting && pickupMins != null && pickupMins <= 10 && pickupMins > -10;
  const noShow = !isDriver && !skipping && waiting && pickupMins != null && pickupMins <= -10;

  // Tell the driver once when riders are waiting and they haven't started.
  useEffect(() => {
    if (late && !trip.lateNotified) void call(url, { action: "late", date: trip.date });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [late, trip.lateNotified]);

  const myRequestId = trip.requestIdByUser[mine.user_id];
  const firstRequestId = Object.values(trip.requestIdByUser)[0];

  let status = "";
  if (trip.status === "live") status = isDriver ? "On the way" : `${driverName} is coming`;
  else if (trip.status === "confirmed") status = isDriver ? "Confirmed" : `${driverName} confirmed`;
  else if (trip.status === "cancelled") status = "No ride";
  else if (trip.status === "missed") status = "Driver didn't show";
  else if (trip.status === "completed") status = "Done";
  else status = isDriver ? `${coming.length} ${coming.length === 1 ? "rider" : "riders"}` : "Waiting to confirm";

  return (
    <div className="card mt-5 p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-medium text-muted">{when}</p>
        {!isDriver && !skipping && mine.pickup_time && trip.status !== "cancelled" && (
          <p className="text-[13px] font-semibold text-ink">{prettyTime(mine.pickup_time)}</p>
        )}
      </div>
      <p className="mt-1 text-[22px] font-semibold tracking-tight text-ink">{skipping && !isDriver ? "You're skipping" : status}</p>
      {!isDriver && !skipping && mine.pickup_label && trip.status !== "cancelled" && <p className="text-sm text-muted">{mine.pickup_label}</p>}

      {isDriver && coming.length > 0 && trip.status !== "cancelled" && (
        <div className="mt-3 flex flex-col gap-2">
          {riders.map((r) => {
            const skip = trip.skippedUserIds.includes(r.user_id);
            return (
              <div key={r.id} className={`flex items-center gap-3 text-sm ${skip ? "opacity-40" : ""}`}>
                <Avatar name={r.user.full_name} photoUrl={r.user.photo_url} size={28} tone="rider" />
                <span className={`flex-1 truncate ${skip ? "line-through" : "text-ink"}`}>{first(r.user.full_name)} · {r.pickup_label}</span>
                <span className="font-semibold text-ink">{prettyTime(r.pickup_time)}</span>
              </div>
            );
          })}
        </div>
      )}

      {late && <Banner tone="warn" icon={<Clock size={17} aria-hidden />} text={`${driverName} hasn't left yet`} />}
      {noShow && (
        <Banner tone="bad" icon={<AlertTriangle size={17} aria-hidden />} text={`${driverName} isn't coming`}>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => call(url, { action: "missed", date: trip.date })} className="btn-ghost py-2.5 text-sm">Report</button>
            <Link href="/map" className="btn-ubc py-2.5 text-sm">Find a ride</Link>
          </div>
        </Banner>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {!isDriver && ["cancelled", "missed"].includes(trip.status) && (
          <Link href="/map" className="btn-ubc w-full"><Zap size={16} aria-hidden /> Find a ride</Link>
        )}
        {!isDriver && trip.status === "live" && myRequestId && (
          <Link href={`/match/${myRequestId}`} className="btn-ubc w-full py-4"><Navigation size={18} aria-hidden /> Track</Link>
        )}
        {!isDriver && !["live", "completed", "missed", "cancelled"].includes(trip.status) && (
          <button
            disabled={!!busy}
            onClick={() => call(`/api/pods/${pod.id}/skip`, { date: trip.date }, skipping ? "DELETE" : "POST")}
            className="btn-ghost w-full"
          >
            {skipping ? <><Check size={16} aria-hidden /> I&apos;m coming</> : <><X size={16} aria-hidden /> Skip {day}</>}
          </button>
        )}
        {!isDriver && trip.status === "completed" && trip.rideId && (
          <Link href={`/trip/${trip.rideId}/complete`} className="btn-ghost w-full">Rate</Link>
        )}

        {isDriver && riders.length > 0 && trip.status === "live" && firstRequestId && (
          <Link href={`/match/${firstRequestId}`} className="btn-ubc w-full py-4"><Navigation size={18} aria-hidden /> Open trip</Link>
        )}
        {isDriver && riders.length > 0 && ["none", "scheduled", "confirmed"].includes(trip.status) && (
          <>
            {isToday && coming.length > 0 && (
              <button disabled={!!busy} onClick={() => call(url, { action: "start", date: trip.date })} className="btn-ubc w-full py-4">
                <Car size={18} aria-hidden /> Start pickup
              </button>
            )}
            {trip.status !== "confirmed" && (
              <button disabled={!!busy} onClick={() => call(url, { action: "confirm", date: trip.date, leaveAt: firstPickup })} className={isToday ? "btn-ghost w-full" : "btn-ubc w-full"}>
                <Check size={16} aria-hidden /> Driving {day}
              </button>
            )}
            <button disabled={!!busy} onClick={() => confirm(`Can't drive ${day}?`) && call(url, { action: "cancel", date: trip.date })} className="w-full py-2 text-sm font-semibold text-muted">
              Can&apos;t drive
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Banner({ tone, icon, text, children }: { tone: "warn" | "bad"; icon: React.ReactNode; text: string; children?: React.ReactNode }) {
  return (
    <div className={`mt-4 rounded-2xl p-4 text-sm ${tone === "warn" ? "bg-sky/10 text-ubc" : "bg-red-50/80 text-red-800"}`}>
      <p className="flex items-center gap-2 font-semibold">{icon}{text}</p>
      {children}
    </div>
  );
}

