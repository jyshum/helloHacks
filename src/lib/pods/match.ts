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
  const riders = (await loadProfiles({ mode: "rider" })).filter((r) => !busy.has(r.user_id));
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

// Run after someone saves their commute. Keeps pods consistent with the new answers.
export async function rematchUser(userId: string): Promise<void> {
  const admin = createAdminClient();
  const [p] = await loadProfiles({ userIds: [userId] });

  // Switched away from driving (or paused): close their pod and release riders.
  if (!p || p.mode !== "driver") {
    const { data: pod } = await admin.from("pods").select("id").eq("driver_id", userId).eq("status", "active").maybeSingle();
    if (pod) {
      const { data: riders } = await admin.from("pod_members").select("user_id").eq("pod_id", pod.id).eq("role", "rider").in("status", ["invited", "requested", "active"]);
      await admin.from("pods").update({ status: "archived" }).eq("id", pod.id);
      await admin.from("pod_members").update({ status: "left", updated_at: new Date().toISOString() }).eq("pod_id", pod.id);
      await postSystemMessage(pod.id, "The driver stopped driving, so this pod has closed.");
      const ids = (riders ?? []).map((m) => m.user_id);
      await notify(ids, { kind: "trip_cancelled", title: "Your pod closed", body: "Your driver stopped driving. We're finding you a new pod.", url: "/pods" });
      for (const id of ids) await matchRider(id);
    }
  }
  if (!p) return;

  if (p.mode === "driver") {
    await fillDriverPod(userId);
  } else {
    // A rider who changed schedule/home loses a pending invite (it may no longer fit).
    // Deleted rather than declined, so that pod can still be offered again if it fits.
    // Riders then pick from their options on /pods (no auto-invite).
    await admin.from("pod_members").delete().eq("user_id", userId).eq("status", "invited");
  }
}
