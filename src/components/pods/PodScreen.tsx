"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { APIProvider } from "@vis.gl/react-google-maps";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  Car,
  Check,
  Clock,
  MapPin,
  MessageCircle,
  Navigation,
  Pencil,
  Timer,
  UserPlus,
  Users,
  X,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BaseMap from "@/components/app/BaseMap";
import ProfileMenu, { type MenuUser } from "@/components/app/ProfileMenu";
import Avatar from "@/components/Avatar";
import SharedBadge from "@/components/SharedBadge";
import { decodePolyline, type LatLng } from "@/lib/geo";
import { dayWord, prettyDate, prettyTime, toMinutes, vancouverNow } from "@/lib/pods/time";
import { WEEKDAY_LABELS, type Weekday } from "@/lib/pods/types";
import type { MemberView, PodView } from "@/lib/pods/load";

type Props = { view: PodView; me: MenuUser; meFaculty: string | null; meYear: number | null };

export default function PodScreen(props: Props) {
  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      <Screen {...props} />
    </APIProvider>
  );
}

function Screen({ view, me, meFaculty, meYear }: Props) {
  const router = useRouter();
  const { pod, driver, driverProfile, vehicle, riders, requests, invited, nextTrip } = view;
  const mine = view.me!;
  const isDriver = mine.role === "driver";
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

  const route = useMemo(
    () => (driverProfile.route_polyline ? decodePolyline(driverProfile.route_polyline) : []),
    [driverProfile.route_polyline]
  );
  const campus = { lat: pod.campus_lat, lng: pod.campus_lng };
  const pickups = [...riders, ...(mine.status !== "active" ? [mine] : [])].filter((m) => m.pickup_lat != null && m.role === "rider");
  const fit: LatLng[] = route.length ? [route[0], campus] : [campus];

  const first = (n: string) => n.split(" ")[0];
  const driverName = first(driver.user.full_name);

  return (
    <div className="relative min-h-[100dvh] bg-paper">
      {/* Map header */}
      <div className="relative h-[34dvh] w-full overflow-hidden">
        <BaseMap
          pins={[
            ...pickups.map((m) => ({ id: m.id, pos: { lat: m.pickup_lat!, lng: m.pickup_lng! }, kind: "pickup" as const })),
            { id: "campus", pos: campus, kind: "dropoff" as const },
          ]}
          routes={route.length ? [{ id: "route", path: route, color: "#0055B7", opacity: 0.8, weight: 5 }] : []}
          fit={fit}
          bottomPadding={20}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto flex max-w-app items-center justify-between p-4">
          <ProfileMenu me={me} mode={isDriver ? "driver" : "rider"} />
          <Link href="/commute" className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-sm font-semibold text-ink shadow-lift">
            <Pencil size={14} aria-hidden /> Edit commute
          </Link>
        </div>
      </div>

      <main className="relative z-10 mx-auto -mt-6 w-full max-w-app rounded-t-[24px] bg-paper px-4 pb-12 pt-5">
        {error && <p className="mb-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {/* ---------- Rider: invited ---------- */}
        {!isDriver && mine.status === "invited" && (
          <InviteCard
            view={view}
            mine={mine}
            meFaculty={meFaculty}
            meYear={meYear}
            busy={!!busy}
            onJoin={() => call(`/api/pods/${pod.id}/join`)}
            onDecline={async () => {
              const r = await call(`/api/pods/${pod.id}/decline-invite`);
              if (r) router.push("/pods");
            }}
          />
        )}

        {/* ---------- Rider: waiting for approval ---------- */}
        {!isDriver && mine.status === "requested" && (
          <div className="card p-5 text-center">
            <Avatar name={driver.user.full_name} photoUrl={driver.user.photo_url} size={64} />
            <h1 className="mt-3 font-heading text-xl font-bold text-ubc">Waiting for {driverName} to approve</h1>
            <p className="mt-1 text-sm text-muted">They can see your profile. This updates the moment they decide.</p>
            <button onClick={() => call(`/api/pods/${pod.id}/leave`)} className="mt-4 text-sm font-semibold text-red-700">Cancel request</button>
          </div>
        )}

        {/* ---------- In the pod ---------- */}
        {(isDriver || mine.status === "active") && (
          <>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue">{isDriver ? "Your pod" : `${driverName}'s pod`}</p>
                <h1 className="font-heading text-2xl font-bold text-ubc">
                  {driverProfile.home_area ?? "Your area"} → {pod.campus_label}
                </h1>
              </div>
            </div>
            <DayChips days={driverProfile.days} arriveBy={driverProfile.arrive_by} />

            {nextTrip && (
              <TripCard
                view={view}
                isDriver={isDriver}
                busy={busy}
                call={call}
              />
            )}

            <Link href={`/pods/${pod.id}/chat`} className="card mt-3 flex items-center gap-3 p-4">
              <span className="row-icon"><MessageCircle size={18} aria-hidden /></span>
              <span className="flex-1">
                <span className="block font-semibold text-ink">Pod chat</span>
                <span className="block text-sm text-muted">Updates and messages with your pod</span>
              </span>
            </Link>

            {/* Driver: approvals */}
            {isDriver && requests.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Wants to join ({requests.length})</h2>
                {requests.map((r) => (
                  <ApprovalCard
                    key={r.id}
                    r={r}
                    me={{ faculty: meFaculty, year: meYear }}
                    busy={!!busy}
                    onDecide={(action) => call(`/api/pods/${pod.id}/members/${r.id}`, { action })}
                  />
                ))}
              </section>
            )}

            {/* Members */}
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                In this pod · {riders.length + 1} {riders.length ? "people" : "person"}
              </h2>
              <div className="card divide-y divide-line px-4">
                <MemberRow m={driver} label="Driver" extra={view.reliability.completed + view.reliability.missed > 0 ? `Showed up ${view.reliability.completed}/${view.reliability.completed + view.reliability.missed}` : undefined} />
                {riders.map((m) => (
                  <MemberRow key={m.id} m={m} label={m.user_id === mine.user_id ? "You" : "Rider"} extra={isDriver || m.user_id === mine.user_id ? pickupLine(m) : undefined} />
                ))}
                {isDriver && view.seatsLeft > 0 && (
                  <div className="flex items-center gap-3 py-3 text-sm text-muted">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-line"><UserPlus size={16} aria-hidden /></span>
                    {view.seatsLeft} open {view.seatsLeft === 1 ? "seat" : "seats"} · we&apos;re matching riders on your route
                  </div>
                )}
              </div>
              {isDriver && invited.length > 0 && (
                <p className="mt-2 text-xs text-muted">{invited.length} matched {invited.length === 1 ? "rider hasn't" : "riders haven't"} answered their invite yet.</p>
              )}
            </section>

            {isDriver && vehicle && (
              <section className="mt-6">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Your car</h2>
                <CarCard vehicle={vehicle} verified={!!driver.user.license_verified} />
              </section>
            )}
            {isDriver && (!vehicle || !driver.user.license_verified) && (
              <Link href="/driver-verify" className="card mt-3 flex items-center gap-3 p-4 text-sm">
                <BadgeCheck size={22} className="text-blue" aria-hidden />
                <span className="flex-1"><b>Verify your license &amp; car.</b> Riders are much more likely to join verified drivers.</span>
              </Link>
            )}

            <div className="mt-8 flex flex-col items-center gap-2">
              <Link href="/map" className="flex items-center gap-1.5 text-sm font-semibold text-blue"><Zap size={14} aria-hidden /> Need a one-off ride today?</Link>
              <button
                onClick={async () => {
                  if (!confirm(isDriver ? "Stop driving this pod? Your riders will be rematched." : "Leave this pod?")) return;
                  const r = await call(`/api/pods/${pod.id}/leave`);
                  if (r) router.push("/pods");
                }}
                className="text-sm font-semibold text-red-700"
              >
                {isDriver ? "Stop driving this pod" : "Leave pod"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------------

function pickupLine(m: MemberView) {
  return m.pickup_time ? `Pickup ${prettyTime(m.pickup_time)} · ${m.pickup_label ?? ""}` : m.pickup_label ?? undefined;
}

function DayChips({ days, arriveBy }: { days: Weekday[]; arriveBy: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {([1, 2, 3, 4, 5] as Weekday[]).map((d) => (
        <span key={d} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${days.includes(d) ? "bg-ubc text-white" : "bg-line/60 text-muted"}`}>
          {WEEKDAY_LABELS[d]}
        </span>
      ))}
      <span className="ml-1 flex items-center gap-1 text-sm text-muted"><Clock size={14} aria-hidden /> on campus by {prettyTime(arriveBy)}</span>
    </div>
  );
}

function TimeSaved({ transit, drive }: { transit: number | null; drive: number | null }) {
  if (transit == null || drive == null) return null;
  const saved = transit - drive;
  if (saved < 5) return null;
  return (
    <div className="rounded-2xl bg-green/10 p-4">
      <p className="flex items-center gap-2 font-heading text-lg font-bold text-green">
        <Timer size={20} aria-hidden /> Saves you ~{saved} min each way
      </p>
      <p className="mt-0.5 text-sm text-green/90">
        Transit {transit} min → {drive} min with the pod
      </p>
    </div>
  );
}

function CarCard({ vehicle, verified }: { vehicle: NonNullable<PodView["vehicle"]>; verified: boolean }) {
  return (
    <div className="card overflow-hidden">
      {vehicle.photo_url && <img src={vehicle.photo_url} alt="Car" className="h-32 w-full object-cover" />}
      <div className="flex items-center justify-between p-4">
        <div>
          <p className="font-heading font-semibold text-ink">{vehicle.color} {vehicle.make_model}</p>
          {verified && <p className="flex items-center gap-1 text-xs font-semibold text-green"><BadgeCheck size={14} aria-hidden /> License verified</p>}
        </div>
        <span className="rounded-lg border-2 border-ubc px-2 py-0.5 font-mono text-sm font-bold tracking-wider text-ubc">{vehicle.license_plate}</span>
      </div>
    </div>
  );
}

function InviteCard({
  view,
  mine,
  meFaculty,
  meYear,
  busy,
  onJoin,
  onDecline,
}: {
  view: PodView;
  mine: MemberView;
  meFaculty: string | null;
  meYear: number | null;
  busy: boolean;
  onJoin: () => void;
  onDecline: () => void;
}) {
  const { driver, vehicle, riders, driverProfile } = view;
  return (
    <div>
      <p className="text-center text-sm font-semibold uppercase tracking-wide text-blue">We found your pod 🎉</p>
      <div className="card mt-3 p-5">
        <div className="flex items-center gap-4">
          <Link href={`/profile/${driver.user_id}`}><Avatar name={driver.user.full_name} photoUrl={driver.user.photo_url} size={64} /></Link>
          <div className="min-w-0 flex-1">
            <Link href={`/profile/${driver.user_id}`} className="font-heading text-xl font-bold text-ink">{driver.user.full_name}</Link>
            <p className="text-sm text-muted">
              ★ {Number(driver.user.rating_avg ?? 5).toFixed(1)}
              {driver.user.faculty ? ` · ${driver.user.faculty}` : ""}
              {driver.user.year ? ` · Year ${driver.user.year}` : ""}
            </p>
            {driver.user.license_verified && (
              <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-green"><BadgeCheck size={14} aria-hidden /> License verified by hoppedIn</p>
            )}
          </div>
        </div>
        <div className="mt-2"><SharedBadge a={{ faculty: meFaculty, year: meYear }} b={driver.user} /></div>

        <div className="mt-4"><TimeSaved transit={mine.transit_minutes} drive={mine.drive_minutes} /></div>

        <div className="mt-4 space-y-3 text-sm">
          <InfoLine icon={<CalendarClock size={18} aria-hidden />} title={`${mine.days.map((d) => WEEKDAY_LABELS[d as Weekday]).join(", ")}`} text={`On campus by ${prettyTime(driverProfile.arrive_by)} · ${driverProfile.campus_label}`} />
          <InfoLine icon={<MapPin size={18} aria-hidden />} title={`Pickup ${prettyTime(mine.pickup_time)}`} text={mine.pickup_label ?? ""} />
          <InfoLine
            icon={<Users size={18} aria-hidden />}
            title={riders.length ? `${riders.length} other ${riders.length === 1 ? "rider" : "riders"} already in` : "You'd be the first rider"}
            text={riders.map((r) => `${r.user.full_name.split(" ")[0]}${r.user.faculty ? ` (${r.user.faculty})` : ""}`).join(", ") || `From ${driverProfile.home_area ?? "near you"}`}
          />
        </div>
      </div>

      {vehicle && <div className="mt-3"><CarCard vehicle={vehicle} verified={!!driver.user.license_verified} /></div>}

      <div className="mt-4 grid grid-cols-[1fr_1.6fr] gap-2">
        <button onClick={onDecline} disabled={busy} className="btn-ghost whitespace-nowrap px-3">Not for me</button>
        <button onClick={onJoin} disabled={busy} className="btn-ubc py-4 text-lg">Join pod</button>
      </div>
      <p className="mt-2 text-center text-xs text-muted">{driver.user.full_name.split(" ")[0]} approves new riders. You can leave any time.</p>
    </div>
  );
}

function InfoLine({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-muted">{icon}</span>
      <div className="min-w-0">
        <p className="font-semibold text-ink">{title}</p>
        <p className="text-muted">{text}</p>
      </div>
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
  const saved = r.transit_minutes != null && r.drive_minutes != null ? r.transit_minutes - r.drive_minutes : null;
  return (
    <div className="card mb-3 p-4">
      <div className="flex items-center gap-3">
        <Link href={`/profile/${r.user_id}`}><Avatar name={r.user.full_name} photoUrl={r.user.photo_url} size={52} tone="rider" /></Link>
        <div className="min-w-0 flex-1">
          <Link href={`/profile/${r.user_id}`} className="font-heading font-semibold text-ink">{r.user.full_name}</Link>
          <p className="text-sm text-muted">
            ★ {Number(r.user.rating_avg ?? 5).toFixed(1)} ({r.user.rating_count ?? 0})
            {r.user.faculty ? ` · ${r.user.faculty}` : ""}
            {r.user.year ? ` · Year ${r.user.year}` : ""}
          </p>
        </div>
        <Link href={`/profile/${r.user_id}`} className="text-sm font-semibold text-blue">Profile</Link>
      </div>
      <div className="mt-2"><SharedBadge a={me} b={r.user} /></div>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-frost p-3 text-center text-sm">
        <Stat value={`${r.days.length}`} label={r.days.map((d) => WEEKDAY_LABELS[d as Weekday][0]).join(" ")} />
        <Stat value={`+${Math.round(Number(r.detour_minutes ?? 0))} min`} label="detour" />
        <Stat value={saved && saved > 0 ? `${saved} min` : "–"} label="they save" />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-muted"><MapPin size={14} aria-hidden /> {pickupLine(r)}</p>
      <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
        <button onClick={() => onDecide("decline")} disabled={busy} className="btn-ghost">Decline</button>
        <button onClick={() => onDecide("approve")} disabled={busy} className="btn-ubc">Approve</button>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-heading font-semibold text-ubc">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

function MemberRow({ m, label, extra }: { m: MemberView; label: string; extra?: string }) {
  return (
    <Link href={`/profile/${m.user_id}`} className="flex items-center gap-3 py-3">
      <Avatar name={m.user.full_name} photoUrl={m.user.photo_url} size={40} tone={m.role === "driver" ? "driver" : "rider"} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">
          {m.user.full_name} <span className="text-xs font-normal text-muted">· {label}</span>
        </p>
        <p className="truncate text-xs text-muted">{extra ?? [m.area, m.user.faculty].filter(Boolean).join(" · ")}</p>
      </div>
      {m.user.license_verified && m.role === "driver" && <BadgeCheck size={18} className="text-green" aria-label="License verified" />}
    </Link>
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
  const driverName = driver.user.full_name.split(" ")[0];
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
  if (trip.status === "live") status = isDriver ? "You're on the way" : `${driverName} is on the way 🚗`;
  else if (trip.status === "confirmed") status = isDriver ? "You confirmed. Thanks!" : `${driverName} confirmed ✅`;
  else if (trip.status === "cancelled") status = isDriver ? "You're not driving" : `${driverName} can't drive`;
  else if (trip.status === "missed") status = "Driver didn't show";
  else if (trip.status === "completed") status = "Done. Nice commute!";
  else status = isDriver ? `${coming.length} ${coming.length === 1 ? "rider" : "riders"} coming` : `Waiting for ${driverName} to confirm`;

  return (
    <div className="card mt-4 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Next ride · {when}</p>
      <p className="mt-1 font-heading text-xl font-bold text-ink">{status}</p>

      {!isDriver && !skipping && mine.pickup_time && trip.status !== "cancelled" && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <MapPin size={14} aria-hidden /> Pickup {prettyTime(mine.pickup_time)} · {mine.pickup_label}
        </p>
      )}
      {!isDriver && skipping && <p className="mt-1 text-sm text-muted">You said you can&apos;t make it {day}.</p>}

      {isDriver && coming.length > 0 && trip.status !== "cancelled" && (
        <div className="mt-3 flex flex-col gap-1.5 text-sm">
          {riders.map((r) => {
            const skip = trip.skippedUserIds.includes(r.user_id);
            return (
              <p key={r.id} className={`flex items-center gap-2 ${skip ? "text-muted line-through" : "text-ink"}`}>
                <span className="w-16 font-mono text-xs text-muted">{prettyTime(r.pickup_time)}</span>
                {r.user.full_name.split(" ")[0]} · {r.pickup_label}
              </p>
            );
          })}
        </div>
      )}
      {isDriver && riders.length === 0 && <p className="mt-1 text-sm text-muted">No riders yet. We&apos;re matching people on your route.</p>}

      {late && (
        <Banner tone="warn" icon={<Clock size={18} aria-hidden />} text={`${driverName} hasn't started yet. We've let them know.`} />
      )}
      {noShow && (
        <Banner tone="bad" icon={<AlertTriangle size={18} aria-hidden />} text={`Looks like ${driverName} isn't coming.`}>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={() => call(url, { action: "missed", date: trip.date })} className="btn-ghost py-2 text-sm">Report no-show</button>
            <Link href="/map" className="btn-ubc py-2 text-sm">Find a ride now</Link>
          </div>
        </Banner>
      )}
      {!isDriver && ["cancelled", "missed"].includes(trip.status) && (
        <Link href="/map" className="btn-ubc mt-4 w-full gap-2"><Zap size={16} aria-hidden /> Find a ride now</Link>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {/* Rider actions */}
        {!isDriver && trip.status === "live" && myRequestId && (
          <Link href={`/match/${myRequestId}`} className="btn-ubc w-full gap-2 py-4"><Navigation size={18} aria-hidden /> Track the car live</Link>
        )}
        {!isDriver && !["live", "completed", "missed"].includes(trip.status) && (
          <button
            disabled={!!busy}
            onClick={() => call(`/api/pods/${pod.id}/skip`, { date: trip.date }, skipping ? "DELETE" : "POST")}
            className="btn-ghost w-full"
          >
            {skipping ? <><Check size={16} aria-hidden /> Actually, I&apos;m coming</> : <><X size={16} aria-hidden /> Can&apos;t make it {day}</>}
          </button>
        )}
        {!isDriver && trip.status === "completed" && trip.rideId && (
          <Link href={`/trip/${trip.rideId}/complete`} className="btn-ghost w-full">Rate this ride</Link>
        )}

        {/* Driver actions */}
        {isDriver && riders.length > 0 && trip.status === "live" && firstRequestId && (
          <Link href={`/match/${firstRequestId}`} className="btn-ubc w-full gap-2 py-4"><Navigation size={18} aria-hidden /> Open live trip</Link>
        )}
        {isDriver && riders.length > 0 && ["none", "scheduled", "confirmed"].includes(trip.status) && (
          <>
            {isToday && coming.length > 0 && (
              <button disabled={!!busy} onClick={() => call(url, { action: "start", date: trip.date })} className="btn-ubc w-full gap-2 py-4">
                <Car size={18} aria-hidden /> Start pickup
              </button>
            )}
            {trip.status !== "confirmed" && (
              <button disabled={!!busy} onClick={() => call(url, { action: "confirm", date: trip.date, leaveAt: firstPickup })} className={isToday ? "btn-ghost w-full" : "btn-ubc w-full py-4"}>
                <Check size={16} aria-hidden /> Yes, I&apos;m driving {day}
              </button>
            )}
            <button disabled={!!busy} onClick={() => confirm(`Tell your pod you can't drive ${day}?`) && call(url, { action: "cancel", date: trip.date })} className="w-full py-2 text-sm font-semibold text-red-700">
              Can&apos;t drive {day}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Banner({ tone, icon, text, children }: { tone: "warn" | "bad"; icon: React.ReactNode; text: string; children?: React.ReactNode }) {
  return (
    <div className={`mt-4 rounded-2xl p-4 text-sm ${tone === "warn" ? "bg-sky/10 text-ubc" : "bg-red-50 text-red-800"}`}>
      <p className="flex items-center gap-2 font-semibold">{icon}{text}</p>
      {children}
    </div>
  );
}
