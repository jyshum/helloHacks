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
export const MAX_EARLY_MINUTES = 15; // driver may arrive up to this much before the rider needs to
const MAX_ROUTE_DISTANCE_KM = 3; // rider home must be this close to the driver's route
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

async function seatsLeft(podId: string, seats: number): Promise<number> {
  const { count } = await createAdminClient()
    .from("pod_members")
    .select("id", { count: "exact", head: true })
    .eq("pod_id", podId)
    .eq("role", "rider")
    .in("status", ["invited", "requested", "active"]);
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

// Pods a rider said no to (or was declined from) are never re-offered.
async function excludedPods(riderId: string): Promise<Set<string>> {
  const { data } = await createAdminClient()
    .from("pod_members")
    .select("pod_id")
    .eq("user_id", riderId)
    .in("status", ["declined", "left"]);
  return new Set((data ?? []).map((m) => m.pod_id));
}

async function invite(podId: string, d: Profile, r: Profile, fit: Fit) {
  await createAdminClient()
    .from("pod_members")
    .upsert(
      {
        pod_id: podId,
        user_id: r.user_id,
        role: "rider",
        status: "invited",
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
  const saved = fit.transitMinutes != null ? fit.transitMinutes - fit.driveMinutes : null;
  await notify([r.user_id], {
    kind: "pod_invite",
    title: "We found your commute pod",
    body: saved && saved > 5 ? `Ride to campus and save ~${saved} min vs transit.` : "A verified UBC driver is heading your way.",
    url: "/pods",
  });
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
  const fits: { r: Profile; fit: Fit }[] = [];
  for (const r of promising) {
    if ((await excludedPods(r.user_id)).has(podId)) continue;
    const fit = await fullFit(d, r, users.get(d.user_id)!, users.get(r.user_id)!);
    if (fit) fits.push({ r, fit });
  }
  fits.sort((a, b) => b.fit.score - a.fit.score);

  let invited = 0;
  for (const { r, fit } of fits) {
    if (open <= 0) break;
    await invite(podId, d, r, fit);
    open--;
    invited++;
  }
  return invited;
}

// Find the best pod for one rider.
export async function matchRider(riderId: string): Promise<boolean> {
  if ((await busyRiderIds()).has(riderId)) return false;
  const [r] = await loadProfiles({ userIds: [riderId], mode: "rider" });
  if (!r) return false;

  const excluded = await excludedPods(riderId);
  const drivers = await loadProfiles({ mode: "driver" });
  const users = await loadUsers([riderId, ...drivers.map((d) => d.user_id)]);

  let best: { d: Profile; podId: string; fit: Fit } | null = null;
  for (const d of drivers) {
    if (d.user_id === riderId) continue;
    const route = await ensureRoute(d);
    if (!quickFit(d, r, route.path)) continue;
    const podId = await ensureDriverPod(d);
    if (excluded.has(podId) || (await seatsLeft(podId, d.seats)) <= 0) continue;
    const fit = await fullFit(d, r, users.get(d.user_id)!, users.get(riderId)!);
    if (fit && (!best || fit.score > best.fit.score)) best = { d, podId, fit };
  }
  if (!best) return false;
  await invite(best.podId, best.d, r, best.fit);
  return true;
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
    await admin.from("pod_members").delete().eq("user_id", userId).eq("status", "invited");
    await matchRider(userId);
  }
}
