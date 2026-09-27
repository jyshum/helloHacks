import { createAdminClient } from "@/lib/supabase/server";
import { calculateDetour, MAX_DETOUR_MINUTES } from "@/lib/matching";
import { closestPointOnPath, decodePolyline, haversineKm, type LatLng } from "@/lib/geo";
import { nearestArea } from "@/lib/areas";
import { notify } from "@/lib/notify";
import { postSystemMessage } from "@/lib/pods/chat";
import { driveRoute, transitMinutes } from "@/lib/pods/directions";
import { arriveOn, fromMinutes, nextDateOn, vancouverTime } from "@/lib/pods/time";
import type { CommuteProfile, Weekday } from "@/lib/pods/types";

// --- Tunables ---------------------------------------------------------------
export const MAX_EARLY_MINUTES = 20; // driver may arrive up to this much before the rider needs to
const MAX_ROUTE_DISTANCE_KM = 3.5; // rider home must be this close to the driver's route
const ON_ROUTE_KM = 0.8; // within this, the rider walks to a pickup spot on the route
const PICKUP_BUFFER_MINUTES = 5;

type Profile = CommuteProfile & { route_polyline: string | null; route_minutes: number | null };
type UserLite = { id: string; full_name: string; faculty: string | null; year: number | null };

export type Fit = {
  days: Weekday[];
  pickup: LatLng;
  pickupLabel: string;
  pickupTime: string; // "HH:MM" on the driver's usual arrival
  detourMinutes: number;
  driveMinutes: number;
  transitMinutes: number | null;
  score: number;
};

const home = (p: Profile): LatLng => ({ lat: p.home_lat, lng: p.home_lng });
const campus = (p: Profile): LatLng => ({ lat: p.campus_lat, lng: p.campus_lng });

// Driver's home→campus route, cached on their profile.
async function ensureRoute(driver: Profile): Promise<{ path: LatLng[]; minutes: number }> {
  if (driver.route_polyline && driver.route_minutes) {
    return { path: decodePolyline(driver.route_polyline), minutes: driver.route_minutes };
  }
  const r = await driveRoute(home(driver), campus(driver));
  await createAdminClient()
    .from("commute_profiles")
    .update({ route_polyline: r.polyline, route_minutes: r.minutes })
    .eq("user_id", driver.user_id);
  driver.route_polyline = r.polyline;
  driver.route_minutes = r.minutes;
  return { path: r.polyline ? decodePolyline(r.polyline) : [home(driver), campus(driver)], minutes: r.minutes };
}

// Days where the driver arrives on time for the rider (and not too early).
function sharedDays(d: Profile, r: Profile): { days: Weekday[]; avgGap: number } {
  const days: Weekday[] = [];
  let gap = 0;
  for (const day of d.days) {
    if (!r.days.includes(day)) continue;
    const g = arriveOn(r, day) - arriveOn(d, day);
    if (g >= 0 && g <= MAX_EARLY_MINUTES) {
      days.push(day);
      gap += g;
    }
  }
  return { days, avgGap: days.length ? gap / days.length : 0 };
}

// Cheap local checks first (no API calls). Returns null if clearly not a fit.
function quickFit(d: Profile, r: Profile, path: LatLng[]) {
  if (d.user_id === r.user_id) return null;
  if (haversineKm(campus(d), campus(r)) > 2) return null; // different end of campus
  const { days, avgGap } = sharedDays(d, r);
  if (!days.length) return null;
  const near = closestPointOnPath(home(r), path);
  if (near.km > MAX_ROUTE_DISTANCE_KM) return null;
  return { days, avgGap, near };
}

// Full fit with detour + transit comparison (a few API calls).
async function fullFit(d: Profile, r: Profile, du: UserLite, ru: UserLite): Promise<Fit | null> {
  const route = await ensureRoute(d);
  const q = quickFit(d, r, route.path);
  if (!q) return null;

  const onRoute = q.near.km <= ON_ROUTE_KM;
  const pickup = onRoute ? q.near.point : home(r);
  const detourMinutes = onRoute ? 1 : (await calculateDetour(home(d), campus(d), pickup)).detourMinutes;
  if (detourMinutes > MAX_DETOUR_MINUTES) return null;

  // Share of the driver's route still left after the pickup ≈ ride time for the rider.
  const total = route.path.slice(1).reduce((s, p, i) => s + haversineKm(route.path[i], p), 0) || 1;
  const after =
    haversineKm(q.near.point, route.path[Math.min(q.near.index + 1, route.path.length - 1)]) +
    route.path.slice(q.near.index + 2).reduce((s, p, i) => s + haversineKm(route.path[q.near.index + 1 + i], p), 0);
  const driveMinutes = Math.max(3, Math.round((route.minutes * after) / total) + Math.round(detourMinutes));

  const firstDay = q.days[0];
  const nextDate = nextDateOn([firstDay], 24 * 60) ?? new Date().toISOString().slice(0, 10);
  const transit = await transitMinutes(home(r), campus(r), vancouverTime(nextDate, arriveOn(r, firstDay)));

  const arrive = arriveOn(d, firstDay);
  const pickupTime = fromMinutes(Math.floor((arrive - driveMinutes - PICKUP_BUFFER_MINUTES) / 5) * 5);
  const saved = transit != null ? Math.max(0, transit - driveMinutes) : 0;

  const score =
    q.days.length * 10 +
    (1 - q.avgGap / MAX_EARLY_MINUTES) * 3 +
    (1 - detourMinutes / MAX_DETOUR_MINUTES) * 3 +
    (Math.min(saved, 45) / 45) * 2 +
    (du.faculty && du.faculty === ru.faculty ? 1 : 0) +
    (du.year && du.year === ru.year ? 0.5 : 0);

  return {
    days: q.days,
    pickup,
    pickupLabel: onRoute ? `${nearestArea(pickup)} · on ${du.full_name.split(" ")[0]}'s route` : `Near home · ${nearestArea(pickup)}`,
    pickupTime,
    detourMinutes: Math.round(detourMinutes),
    driveMinutes,
    transitMinutes: transit,
    score: Math.round(score * 100) / 100,
  };
}

// --- Pod bookkeeping ----------------------------------------------------------

async function loadProfiles(filter: { mode?: "driver" | "rider"; userIds?: string[] }) {
  const admin = createAdminClient();
  let q = admin.from("commute_profiles").select("*").eq("active", true);
  if (filter.mode) q = q.eq("mode", filter.mode);
  if (filter.userIds) q = q.in("user_id", filter.userIds);
  const { data } = await q;
  return (data ?? []) as Profile[];
}

// Real people have a login; seeded demo users don't (auth_id is null).
async function isRealUser(userId: string): Promise<boolean> {
  const { data } = await createAdminClient().from("users").select("auth_id").eq("id", userId).maybeSingle();
  return !!data?.auth_id;
}
async function realUserIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data } = await createAdminClient().from("users").select("id").in("id", ids).not("auth_id", "is", null);
  return new Set((data ?? []).map((u) => u.id));
}

async function loadUsers(ids: string[]): Promise<Map<string, UserLite>> {
  if (!ids.length) return new Map();
  const { data } = await createAdminClient().from("users").select("id, full_name, faculty, year").in("id", ids);
  return new Map((data ?? []).map((u) => [u.id, u as UserLite]));
}

// Driver's active pod, created if missing.
export async function ensureDriverPod(d: Profile): Promise<string> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("pods").select("id").eq("driver_id", d.user_id).eq("status", "active").maybeSingle();
  const podId =
    existing?.id ??
    (await admin
      .from("pods")
      .insert({ driver_id: d.user_id, campus_lat: d.campus_lat, campus_lng: d.campus_lng, campus_label: d.campus_label })
      .select("id")
      .single()).data!.id;
  if (existing) {
    await admin.from("pods").update({ campus_lat: d.campus_lat, campus_lng: d.campus_lng, campus_label: d.campus_label }).eq("id", podId);
  }
  await admin
    .from("pod_members")
    .upsert(
      { pod_id: podId, user_id: d.user_id, role: "driver", status: "active", days: d.days, updated_at: new Date().toISOString() },
      { onConflict: "pod_id,user_id" }
    );
  return podId;
}

async function seatsLeft(podId: string, seats: number, ignoreUserId?: string): Promise<number> {
  let q = createAdminClient()
    .from("pod_members")
    .select("id", { count: "exact", head: true })
    .eq("pod_id", podId)
    .eq("role", "rider")
    .in("status", ["invited", "requested", "active"]);
  if (ignoreUserId) q = q.neq("user_id", ignoreUserId);
  const { count } = await q;
  return seats - (count ?? 0);
}

// Riders who already have a pod (or a pending invite) don't get more invites.
async function busyRiderIds(): Promise<Set<string>> {
  const { data } = await createAdminClient()
    .from("pod_members")
    .select("user_id")
    .eq("role", "rider")
    .in("status", ["invited", "requested", "active"]);
  return new Set((data ?? []).map((m) => m.user_id));
}

// Pods a rider passed on (or was declined from) are never offered again.
// Pods they left are only hidden from driver-side invites, not from their own choices.
async function excludedPods(riderId: string, opts: { includeLeft?: boolean } = {}): Promise<Set<string>> {
  const { data } = await createAdminClient()
    .from("pod_members")
    .select("pod_id")
    .eq("user_id", riderId)
    .in("status", opts.includeLeft ? ["declined", "left"] : ["declined"]);
  return new Set((data ?? []).map((m) => m.pod_id));
}

// Real riders get an invite to accept. Demo riders (no login, can't tap Join) join straight away.
async function invite(podId: string, d: Profile, r: Profile, fit: Fit): Promise<"invited" | "active"> {
  const admin = createAdminClient();
  const { data: u } = await admin.from("users").select("auth_id, full_name").eq("id", r.user_id).single();
  const status = u?.auth_id ? "invited" : "active";
  await admin
    .from("pod_members")
    .upsert(
      {
        pod_id: podId,
        user_id: r.user_id,
        role: "rider",
        status,
        days: fit.days,
        pickup_lat: fit.pickup.lat,
        pickup_lng: fit.pickup.lng,
        pickup_label: fit.pickupLabel,
        pickup_time: fit.pickupTime,
        detour_minutes: fit.detourMinutes,
        drive_minutes: fit.driveMinutes,
        transit_minutes: fit.transitMinutes,
        score: fit.score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pod_id,user_id" }
    );
  if (status === "active") {
    await postSystemMessage(podId, `${u?.full_name ?? "A rider"} joined the pod.`);
    return status;
  }
  const saved = fit.transitMinutes != null ? fit.transitMinutes - fit.driveMinutes : null;
  await notify([r.user_id], {
    kind: "pod_invite",
    title: "We found your commute pod",
    body: saved && saved > 5 ? `Ride to campus and save ~${saved} min vs transit.` : "A verified UBC driver is heading your way.",
    url: "/pods",
  });
  return status;
}

// --- Entry points ---------------------------------------------------------------

// Fill a driver's empty seats with the best-fitting unmatched riders.
export async function fillDriverPod(driverId: string): Promise<number> {
  const [d] = await loadProfiles({ userIds: [driverId], mode: "driver" });
  if (!d) return 0;
  const podId = await ensureDriverPod(d);
  let open = await seatsLeft(podId, d.seats);
  if (open <= 0) return 0;

  const route = await ensureRoute(d);
  const busy = await busyRiderIds();
  let riders = (await loadProfiles({ mode: "rider" })).filter((r) => !busy.has(r.user_id));
  // A real driver's pod is never auto-filled with demo riders: they show up in
  // "Riders for you" and search instead, and the driver chooses. Demo pods still fill.
  if (await isRealUser(d.user_id)) {
    const real = await realUserIds(riders.map((r) => r.user_id));
    riders = riders.filter((r) => real.has(r.user_id));
  }
  // Local prefilter, then full checks on the most promising few.
  const promising = riders
    .map((r) => ({ r, q: quickFit(d, r, route.path) }))
    .filter((x) => x.q)
    .sort((a, b) => b.q!.days.length - a.q!.days.length || a.q!.near.km - b.q!.near.km)
    .slice(0, open * 3)
    .map((x) => x.r);

  const users = await loadUsers([d.user_id, ...promising.map((r) => r.user_id)]);
  const fits = (
    await Promise.all(
      promising.map(async (r) => {
        if ((await excludedPods(r.user_id, { includeLeft: true })).has(podId)) return null;
        const fit = await fullFit(d, r, users.get(d.user_id)!, users.get(r.user_id)!);
        return fit ? { r, fit } : null;
      })
    )
  )
    .filter((x): x is { r: Profile; fit: Fit } => !!x)
    .sort((a, b) => b.fit.score - a.fit.score);

  let invited = 0;
  for (const { r, fit } of fits) {
    if (open <= 0) break;
    await invite(podId, d, r, fit);
    open--;
    invited++;
  }
  return invited;
}

// Days a rider already has covered by pods they're in (or have asked to join).
export async function coveredDays(riderId: string): Promise<{ days: Set<number>; podIds: Set<string> }> {
  const { data } = await createAdminClient()
    .from("pod_members")
    .select("pod_id, days, pod:pods!inner(status)")
    .eq("user_id", riderId)
    .eq("role", "rider")
    .in("status", ["active", "requested"])
    .eq("pod.status", "active");
  const days = new Set<number>();
  (data ?? []).forEach((m) => (m.days as number[]).forEach((d) => days.add(d)));
  return { days, podIds: new Set((data ?? []).map((m) => m.pod_id)) };
}

// How each weekday looks for a rider in a pod: fits, drives but the time is off, or no ride.
export type DayState = { day: Weekday; state: "fit" | "off" | "none"; gap: number | null };
export function dayStates(
  driver: Pick<CommuteProfile, "days" | "arrive_by" | "day_times">,
  rider: Pick<CommuteProfile, "days" | "arrive_by" | "day_times">,
  fitDays: number[],
  covered: number[] = []
): DayState[] {
  return ([1, 2, 3, 4, 5] as Weekday[]).map((day) => {
    if (fitDays.includes(day)) return { day, state: "fit", gap: null };
    if (!driver.days.includes(day) || !rider.days.includes(day) || covered.includes(day)) return { day, state: "none", gap: null };
    // Minutes the driver arrives after (+) or before (-) the rider needs to be there.
    return { day, state: "off", gap: arriveOn(driver, day) - arriveOn(rider, day) };
  });
}

export type PodOption = { podId: string; driverId: string; fit: Fit };

// The best few pods for a rider, best first. Doesn't invite anyone.
export async function podOptions(riderId: string, limit = 8): Promise<PodOption[]> {
  const [profile] = await loadProfiles({ userIds: [riderId], mode: "rider" });
  if (!profile) return [];
  // Riders can be in several pods (e.g. Mon/Wed with one, Tue/Thu with another),
  // so only look for days that aren't covered yet.
  const covered = await coveredDays(riderId);
  const open = profile.days.filter((d) => !covered.days.has(d));
  if (!open.length) return [];
  const r: Profile = { ...profile, days: open };
  const excluded = await excludedPods(riderId);
  covered.podIds.forEach((id) => excluded.add(id));
  const drivers = await loadProfiles({ mode: "driver" });
  const users = await loadUsers([riderId, ...drivers.map((d) => d.user_id)]);

  // Cheap filters first (no Google calls): shared days + near the straight line
  // from the driver's home to campus. Only the closest few get real route checks.
  const shortlist = drivers
    .filter((d) => d.user_id !== riderId && sharedDays(d, r).days.length > 0)
    .map((d) => ({ d, km: closestPointOnPath(home(r), [home(d), campus(d)]).km }))
    .filter((x) => x.km <= MAX_ROUTE_DISTANCE_KM + 2)
    .sort((a, b) => a.km - b.km)
    .slice(0, 16)
    .map((x) => x.d);

  const fits = await Promise.all(
    shortlist.map(async (d) => {
      const route = await ensureRoute(d);
      if (!quickFit(d, r, route.path)) return null;
      const podId = await ensureDriverPod(d);
      if (excluded.has(podId) || (await seatsLeft(podId, d.seats, riderId)) <= 0) return null;
      const fit = await fullFit(d, r, users.get(d.user_id)!, users.get(riderId)!);
      return fit ? { podId, driverId: d.user_id, fit } : null;
    })
  );
  return fits
    .filter((f): f is PodOption => !!f)
    .sort((a, b) => b.fit.score - a.fit.score)
    .slice(0, limit);
}

// Invite a rider to their single best pod (used when a pod closes or a driver declines).
export async function matchRider(riderId: string): Promise<boolean> {
  if ((await busyRiderIds()).has(riderId)) return false;
  const [best] = await podOptions(riderId, 1);
  if (!best) return false;
  const [d] = await loadProfiles({ userIds: [best.driverId], mode: "driver" });
  const [r] = await loadProfiles({ userIds: [riderId], mode: "rider" });
  if (!d || !r) return false;
  await invite(best.podId, d, r, best.fit);
  return true;
}

// How one pod fits a rider (for the preview and for joining). No writes except caches.
export async function fitFor(
  riderId: string,
  podId: string
): Promise<{ fit: Fit; driver: Profile; rider: Profile; profile: Profile; covered: number[] } | { error: string }> {
  const admin = createAdminClient();
  const { data: pod } = await admin.from("pods").select("id, driver_id, status").eq("id", podId).maybeSingle();
  if (!pod || pod.status !== "active") return { error: "That pod isn't available any more." };
  const [d] = await loadProfiles({ userIds: [pod.driver_id], mode: "driver" });
  const [profile] = await loadProfiles({ userIds: [riderId], mode: "rider" });
  if (!d || !profile) return { error: "Set up your commute first." };
  const covered = await coveredDays(riderId);
  covered.podIds.delete(podId);
  const open = profile.days.filter((day) => !covered.days.has(day));
  if (!open.length) return { error: "All your days already have a pod." };
  const r: Profile = { ...profile, days: open };
  const users = await loadUsers([riderId, d.user_id]);
  const fit = await fullFit(d, r, users.get(d.user_id)!, users.get(riderId)!);
  if (!fit) return { error: "That pod doesn't fit your schedule." };
  return { fit, driver: d, rider: r, profile, covered: Array.from(covered.days) };
}

// Rider picks a pod. Seeded drivers can't approve, so those riders go straight in.
export async function requestToJoin(riderId: string, podId: string): Promise<{ status: "requested" | "active" } | { error: string }> {
  const admin = createAdminClient();
  const res = await fitFor(riderId, podId);
  if ("error" in res) return res;
  const { fit, driver: d } = res;
  if ((await seatsLeft(podId, d.seats, riderId)) <= 0) return { error: "That pod just filled up." };

  const { data: driver } = await admin.from("users").select("auth_id").eq("id", d.user_id).single();
  const status = driver?.auth_id ? "requested" : "active";
  // Pending invites elsewhere for the same days are now moot.
  const { data: pending } = await admin.from("pod_members").select("id, days").eq("user_id", riderId).eq("role", "rider").eq("status", "invited").neq("pod_id", podId);
  const clash = (pending ?? []).filter((m) => (m.days as number[]).some((day) => fit.days.includes(day as Weekday))).map((m) => m.id);
  if (clash.length) await admin.from("pod_members").delete().in("id", clash);
  await admin.from("pod_members").upsert(
    {
      pod_id: podId,
      user_id: riderId,
      role: "rider",
      status,
      days: fit.days,
      pickup_lat: fit.pickup.lat,
      pickup_lng: fit.pickup.lng,
      pickup_label: fit.pickupLabel,
      pickup_time: fit.pickupTime,
      detour_minutes: fit.detourMinutes,
      drive_minutes: fit.driveMinutes,
      transit_minutes: fit.transitMinutes,
      score: fit.score,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "pod_id,user_id" }
  );
  return { status };
}

// --- Driver side: riders for you --------------------------------------------------

export type RiderOption = { rider: Profile; fit: Fit; covered: number[] };

// Who's already spoken for: riders in this pod, riders who left or passed on it,
// and the days each rider already has covered by another pod.
async function riderBook(podId: string) {
  const { data } = await createAdminClient()
    .from("pod_members")
    .select("user_id, pod_id, days, status")
    .eq("role", "rider")
    .in("status", ["invited", "requested", "active", "declined", "left"]);
  const here = new Set<string>();
  const covered = new Map<string, number[]>();
  for (const m of data ?? []) {
    if (m.pod_id === podId) here.add(m.user_id);
    else if (m.status === "active" || m.status === "requested") covered.set(m.user_id, [...(covered.get(m.user_id) ?? []), ...(m.days as number[])]);
  }
  return { here, covered };
}

// Riders whose commute fits this driver, best first. Only their open days count.
export async function riderOptions(driverId: string, limit = 6): Promise<RiderOption[]> {
  const [d] = await loadProfiles({ userIds: [driverId], mode: "driver" });
  if (!d) return [];
  const podId = await ensureDriverPod(d);
  const route = await ensureRoute(d);
  const { here, covered } = await riderBook(podId);
  const open = (await loadProfiles({ mode: "rider" }))
    .filter((r) => !here.has(r.user_id))
    .map((r) => ({ full: r, r: { ...r, days: r.days.filter((day) => !covered.get(r.user_id)?.includes(day)) } }))
    .filter((x) => x.r.days.length);
  const promising = open
    .map((x) => ({ ...x, q: quickFit(d, x.r, route.path) }))
    .filter((x) => x.q)
    .sort((a, b) => b.q!.days.length - a.q!.days.length || a.q!.near.km - b.q!.near.km)
    .slice(0, limit * 2);
  const users = await loadUsers([d.user_id, ...promising.map((x) => x.r.user_id)]);
  const fits = await Promise.all(
    promising.map(async (x) => {
      const fit = await fullFit(d, x.r, users.get(d.user_id)!, users.get(x.r.user_id)!);
      return fit ? { rider: x.full, fit, covered: covered.get(x.r.user_id) ?? [] } : null;
    })
  );
  return fits.filter((x): x is RiderOption => !!x).sort((a, b) => b.fit.score - a.fit.score).slice(0, limit);
}

// Driver taps Add on a rider from "Riders for you".
export async function addRider(driverId: string, riderId: string): Promise<{ status: "invited" | "active" } | { error: string }> {
  const [d] = await loadProfiles({ userIds: [driverId], mode: "driver" });
  const [r] = await loadProfiles({ userIds: [riderId], mode: "rider" });
  if (!d || !r) return { error: "That rider isn't available any more." };
  const podId = await ensureDriverPod(d);
  if ((await seatsLeft(podId, d.seats, riderId)) <= 0) return { error: "Your car is full." };
  const { covered } = await riderBook(podId);
  const openR = { ...r, days: r.days.filter((day) => !covered.get(riderId)?.includes(day)) };
  const users = await loadUsers([driverId, riderId]);
  const fit = openR.days.length ? await fullFit(d, openR, users.get(driverId)!, users.get(riderId)!) : null;
  if (!fit) return { error: "That rider doesn't fit your route any more." };

  return { status: await invite(podId, d, r, fit) };
}

// --- Directory: quick fit between you and anyone you search up ---------------------

export type QuickMatch = { fits: boolean; days: Weekday[]; note: string };

// Cheap fit for the "Find commuters" directory: same checks as the engine's first pass
// (campus, days on time, distance to the driver's saved route), with no Google calls.
// The real check still runs when someone taps Invite or Request to join.
export async function directoryFits(viewerId: string, otherIds: string[]): Promise<Map<string, QuickMatch>> {
  const out = new Map<string, QuickMatch>();
  const [me] = await loadProfiles({ userIds: [viewerId] });
  if (!me || !otherIds.length) return out;
  const pathOf = (p: Profile) => (p.route_polyline ? decodePolyline(p.route_polyline) : [home(p), campus(p)]);
  const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

  for (const o of await loadProfiles({ userIds: otherIds })) {
    if (o.mode === me.mode) {
      out.set(o.user_id, { fits: false, days: [], note: o.mode === "driver" ? "Also drives" : "Also rides" });
      continue;
    }
    const d = me.mode === "driver" ? me : o;
    const r = me.mode === "driver" ? o : me;
    const q = quickFit(d, r, pathOf(d));
    if (q) {
      const days = q.days.length === 5 ? "Mon–Fri" : q.days.map((x) => DAY[x]).join(", ");
      if (q.near.km <= ON_ROUTE_KM) {
        out.set(o.user_id, { fits: true, days: q.days, note: `Fits · ${days} · on the route` });
        continue;
      }
      // Off the route: estimate the detour (there and back, ~1.3x road factor, 35 km/h).
      const detour = Math.round(((q.near.km * 2 * 1.3) / 35) * 60);
      if (detour <= MAX_DETOUR_MINUTES) {
        out.set(o.user_id, { fits: true, days: q.days, note: `Likely fit · ${days} · ~${detour} min detour` });
        continue;
      }
      out.set(o.user_id, { fits: false, days: [], note: `~${detour} min detour (max ${MAX_DETOUR_MINUTES})` });
      continue;
    }
    let note = "Doesn't fit";
    if (haversineKm(campus(d), campus(r)) > 2) note = "Different end of campus";
    else if (!d.days.some((x) => r.days.includes(x))) note = "No days in common";
    else if (!sharedDays(d, r).days.length) note = "Times don't line up";
    else note = `${closestPointOnPath(home(r), pathOf(d)).km.toFixed(1)} km off the route`;
    out.set(o.user_id, { fits: false, days: [], note });
  }
  return out;
}

// --- Pausing and closing a pod ----------------------------------------------------

export const PAUSE_HOLD_DAYS = 7; // a paused pod keeps riders' spots this long, then closes

// The driver's current pod, whether running or paused.
export async function driverPod(driverId: string): Promise<{ id: string; status: "active" | "paused"; paused_at: string | null } | null> {
  // select("*") so this still works before the pause migration adds paused_at.
  const { data } = await createAdminClient()
    .from("pods")
    .select("*")
    .eq("driver_id", driverId)
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, status: data.status, paused_at: data.paused_at ?? null } : null;
}

// Close a pod for good: everyone leaves, riders are told and re-matched elsewhere.
export async function closePod(podId: string, reason = "The driver stopped driving, so this pod has closed."): Promise<void> {
  const admin = createAdminClient();
  const { data: riders } = await admin.from("pod_members").select("user_id").eq("pod_id", podId).eq("role", "rider").in("status", ["invited", "requested", "active"]);
  await admin.from("pods").update({ status: "archived" }).eq("id", podId);
  await admin.from("pod_members").update({ status: "left", updated_at: new Date().toISOString() }).eq("pod_id", podId);
  await postSystemMessage(podId, reason);
  const ids = (riders ?? []).map((m) => m.user_id);
  await notify(ids, { kind: "trip_cancelled", title: "Your pod closed", body: "Your driver stopped driving. We're finding you a new pod.", url: "/pods" });
  for (const id of ids) await matchRider(id);
}

// Driver takes a break: the pod and its riders stay together, but no trips run and the
// driver drops out of matching until they resume (or it closes after PAUSE_HOLD_DAYS).
export async function pausePod(driverId: string): Promise<{ podId: string } | { error: string }> {
  const admin = createAdminClient();
  const pod = await driverPod(driverId);
  if (!pod) return { error: "You don't have a pod to pause." };
  if (pod.status === "paused") return { podId: pod.id };
  const now = new Date().toISOString();
  // Nothing else changes unless the pod really paused (needs migration 20261003000000_pod_pause).
  const { error } = await admin.from("pods").update({ status: "paused", paused_at: now }).eq("id", pod.id);
  if (error) return { error: "Pausing isn't set up in the database yet." };
  await admin.from("commute_profiles").update({ active: false }).eq("user_id", driverId);
  // Open invites point at a pod that isn't running; withdraw them.
  await admin.from("pod_members").delete().eq("pod_id", pod.id).eq("status", "invited");

  const [{ data: u }, { data: riders }] = await Promise.all([
    admin.from("users").select("full_name").eq("id", driverId).single(),
    admin.from("pod_members").select("user_id").eq("pod_id", pod.id).eq("role", "rider").in("status", ["active", "requested"]),
  ]);
  const first = (u?.full_name ?? "Your driver").split(" ")[0];
  const until = holdUntil(now);
  await postSystemMessage(pod.id, `${first} paused driving. Everyone's spot is held until ${until}.`);
  await notify((riders ?? []).map((r) => r.user_id), {
    kind: "pod_paused",
    title: `${first} paused driving`,
    body: `Your spot is held until ${until}. You can find a backup pod in the meantime.`,
    url: `/pods/${pod.id}`,
  });
  return { podId: pod.id };
}

// Driver is back: same pod, same riders. Riders who found another pod for the same days
// in the meantime are released from this one so nobody is double-booked.
export async function resumePod(driverId: string): Promise<{ podId: string } | { error: string }> {
  const admin = createAdminClient();
  const pod = await driverPod(driverId);
  if (!pod) return { error: "You don't have a paused pod." };
  await admin.from("commute_profiles").update({ active: true }).eq("user_id", driverId);
  if (pod.status === "active") return { podId: pod.id };

  // Check riders against their OTHER pods while this one still counts as paused
  // (coveredDays only looks at active pods).
  const { data: riders } = await admin.from("pod_members").select("id, user_id, days, user:users!pod_members_user_id_fkey(full_name)").eq("pod_id", pod.id).eq("role", "rider").in("status", ["active", "requested"]);
  const movedIds = new Set<string>();
  for (const r of riders ?? []) {
    const elsewhere = await coveredDays(r.user_id);
    if ((r.days as number[]).every((d) => elsewhere.days.has(d))) movedIds.add(r.id);
  }
  const { error } = await admin.from("pods").update({ status: "active", paused_at: null }).eq("id", pod.id);
  if (error) return { error: error.message };

  const staying: string[] = [];
  for (const r of riders ?? []) {
    if (movedIds.has(r.id)) {
      await admin.from("pod_members").update({ status: "left", updated_at: new Date().toISOString() }).eq("id", r.id);
      const name = (r.user as unknown as { full_name: string } | null)?.full_name ?? "A rider";
      await postSystemMessage(pod.id, `${name.split(" ")[0]} moved to another pod while this one was paused.`);
    } else staying.push(r.user_id);
  }

  const { data: u } = await admin.from("users").select("full_name").eq("id", driverId).single();
  const first = (u?.full_name ?? "Your driver").split(" ")[0];
  await postSystemMessage(pod.id, `${first} is driving again.`);
  await notify(staying, { kind: "pod_resumed", title: `${first} is driving again`, body: "Your pod is back on. Same pickup, same time.", url: `/pods/${pod.id}` });
  return { podId: pod.id };
}

export function holdUntil(pausedAt: string): string {
  const d = new Date(new Date(pausedAt).getTime() + PAUSE_HOLD_DAYS * 86400000);
  return d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Vancouver" });
}

// Run after someone saves their commute. Keeps pods consistent with the new answers.
export async function rematchUser(userId: string): Promise<void> {
  const admin = createAdminClient();
  const [p] = await loadProfiles({ userIds: [userId] });

  // Switched away from driving (or stopped for good): close their pod and release riders.
  if (!p || p.mode !== "driver") {
    const pod = await driverPod(userId);
    if (pod) await closePod(pod.id);
  }
  if (!p) return;

  if (p.mode === "driver") {
    // Saving the commute as a driver again brings a paused pod back instead of starting a new one.
    const pod = await driverPod(userId);
    if (pod?.status === "paused") await resumePod(userId);
    await fillDriverPod(userId);
  } else {
    // A rider who changed schedule/home loses a pending invite (it may no longer fit).
    // Deleted rather than declined, so that pod can still be offered again if it fits.
    // Riders then pick from their options on /pods (no auto-invite).
    await admin.from("pod_members").delete().eq("user_id", userId).eq("status", "invited");
  }
}
