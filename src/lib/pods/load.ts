import { createAdminClient } from "@/lib/supabase/server";
import { nearestArea } from "@/lib/areas";
import { publicRouteStart } from "@/lib/pods/route";
import { holdUntil } from "@/lib/pods/match";
import { arriveOn, nextDateOn, toMinutes, vancouverNow, weekdayOf } from "@/lib/pods/time";
import type { CommuteProfile, Pod, PodMember, PodTrip, Weekday } from "@/lib/pods/types";
import type { User, Vehicle } from "@/lib/types";

export type MemberView = PodMember & {
  user: Pick<User, "id" | "full_name" | "photo_url" | "faculty" | "year" | "rating_avg" | "rating_count" | "license_verified">;
  area: string | null;
};

export type TripView = {
  date: string;
  status: PodTrip["status"] | "none";
  tripId: string | null;
  rideId: string | null;
  skippedUserIds: string[];
  requestIdByUser: Record<string, string>; // rider → their ride_requests id (for /match)
  lateNotified: boolean;
};

export type PodView = {
  pod: Pod;
  me: MemberView | null; // null = not a member (e.g. viewing an invite that was withdrawn)
  driver: MemberView;
  driverProfile: Pick<CommuteProfile, "home_area" | "days" | "arrive_by" | "day_times" | "seats" | "campus_label" | "home_leave_at" | "home_day_times"> & {
    route_polyline: string | null;
    route_minutes: number | null;
  };
  vehicle: Vehicle | null;
  routeStart: { lat: number; lng: number }; // driver's home for the driver, a point ~400 m along the route for everyone else
  members: MemberView[]; // everyone (driver first), any status
  riders: MemberView[]; // active riders
  requests: MemberView[]; // riders waiting for driver approval
  invited: MemberView[]; // riders we invited, not answered yet
  seatsLeft: number;
  reliability: { completed: number; missed: number };
  nextTrip: TripView | null;
  homeRides: { user_id: string; trip_date: string }[]; // who's in for upcoming rides home
  skips: { user_id: string; trip_date: string }[]; // who's skipping upcoming rides to campus
  paused: { since: string; until: string } | null; // driver paused driving; spots held until `until`
};

const USER_COLS = "id, full_name, photo_url, faculty, year, rating_avg, rating_count, license_verified";

export async function loadPodView(podId: string, meUserId: string): Promise<PodView | null> {
  const admin = createAdminClient();
  const { data: pod } = await admin.from("pods").select("*").eq("id", podId).maybeSingle();
  if (!pod) return null;

  const { data: rows } = await admin
    .from("pod_members")
    .select(`*, user:users!pod_members_user_id_fkey(${USER_COLS})`)
    .eq("pod_id", podId)
    .order("created_at", { ascending: true });
  const memberRows = (rows ?? []) as (PodMember & { user: MemberView["user"] })[];

  const ids = memberRows.map((m) => m.user_id);
  const { data: profiles } = await admin.from("commute_profiles").select("*").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const profileOf = (id: string) => (profiles ?? []).find((p) => p.user_id === id) as (CommuteProfile & { route_polyline: string | null; route_minutes: number | null }) | undefined;

  const members: MemberView[] = memberRows.map((m) => ({ ...m, area: profileOf(m.user_id)?.home_area ?? null }));
  const driver = members.find((m) => m.role === "driver");
  const dp = profileOf(pod.driver_id);
  if (!driver || !dp) return null;

  // Only the driver and approved riders see exact pickup spots of others.
  const me = members.find((m) => m.user_id === meUserId) ?? null;
  const insider = me && (me.role === "driver" || me.status === "active");
  const safe = members.map((m) =>
    insider || m.user_id === meUserId ? m : { ...m, pickup_lat: null, pickup_lng: null }
  );

  const { data: vehicle } = await admin.from("vehicles").select("*").eq("user_id", pod.driver_id).maybeSingle();

  const riders = safe.filter((m) => m.role === "rider" && m.status === "active");
  const requests = safe.filter((m) => m.role === "rider" && m.status === "requested");
  const invited = safe.filter((m) => m.role === "rider" && m.status === "invited");

  const [{ data: homeRides }, { data: skips }] = await Promise.all([
    admin.from("pod_home_rides").select("user_id, trip_date").eq("pod_id", podId).gte("trip_date", vancouverNow().date),
    admin.from("pod_skips").select("user_id, trip_date").eq("pod_id", podId).gte("trip_date", vancouverNow().date),
  ]);

  const { data: history } = await admin.from("pod_trips").select("status").eq("pod_id", podId).in("status", ["completed", "missed"]);
  const reliability = {
    completed: (history ?? []).filter((t) => t.status === "completed").length,
    missed: (history ?? []).filter((t) => t.status === "missed").length,
  };

  return {
    pod,
    me: safe.find((m) => m.user_id === meUserId) ?? null,
    driver: safe.find((m) => m.role === "driver")!,
    driverProfile: {
      home_area: dp.home_area,
      days: dp.days,
      arrive_by: dp.arrive_by,
      day_times: dp.day_times,
      home_leave_at: dp.home_leave_at,
      home_day_times: dp.home_day_times ?? {},
      seats: dp.seats,
      campus_label: dp.campus_label,
      // Only the driver gets their raw route (it starts at their home).
      route_polyline: me?.role === "driver" ? dp.route_polyline : null,
      route_minutes: dp.route_minutes,
    },
    routeStart: me?.role === "driver" ? { lat: dp.home_lat, lng: dp.home_lng } : publicRouteStart(dp.route_polyline, { lat: dp.home_lat, lng: dp.home_lng }),
    vehicle: (vehicle as Vehicle) ?? null,
    members: safe,
    riders,
    requests,
    invited,
    seatsLeft: dp.seats - riders.length - requests.length - invited.length,
    reliability,
    homeRides: homeRides ?? [],
    skips: skips ?? [],
    // Riders only ride on their own days in this pod. Paused pods have no upcoming trip.
    nextTrip: pod.status === "paused" ? null : await loadNextTrip(podId, dp, me && me.role === "rider" && me.days.length ? (me.days as Weekday[]) : undefined),
    paused: pod.status === "paused" && pod.paused_at ? { since: pod.paused_at, until: holdUntil(pod.paused_at) } : null,
  };
}

// The pod's next commute day (today until 30 min after arrival, then the next one).
async function loadNextTrip(podId: string, dp: CommuteProfile, onlyDays?: Weekday[]): Promise<TripView | null> {
  const days = onlyDays ?? dp.days;
  const today = vancouverNow();
  const todayCutoff = days.includes(today.weekday as Weekday) ? arriveOn(dp, today.weekday as Weekday) + 30 : 0;
  const date = nextDateOn(days, todayCutoff);
  if (!date) return null;

  const admin = createAdminClient();
  const [{ data: trip }, { data: skips }] = await Promise.all([
    admin.from("pod_trips").select("*").eq("pod_id", podId).eq("trip_date", date).maybeSingle(),
    admin.from("pod_skips").select("user_id").eq("pod_id", podId).eq("trip_date", date),
  ]);

  const requestIdByUser: Record<string, string> = {};
  if (trip?.ride_id) {
    const { data: reqs } = await admin.from("ride_requests").select("id, rider_id").eq("ride_id", trip.ride_id);
    for (const r of reqs ?? []) requestIdByUser[r.rider_id] = r.id;
  }
  return {
    date,
    status: trip?.status ?? "none",
    tripId: trip?.id ?? null,
    rideId: trip?.ride_id ?? null,
    skippedUserIds: (skips ?? []).map((s) => s.user_id),
    requestIdByUser,
    lateNotified: !!trip?.late_notified_at,
  };
}

// Which pod should this user see? Active > requested > invited.
export async function myPodId(userId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("pod_members")
    .select("pod_id, status, pod:pods!inner(status)")
    .eq("user_id", userId)
    .in("status", ["active", "requested", "invited"])
    .in("pod.status", ["active", "paused"]);
  const rank = { active: 0, requested: 1, invited: 2 } as Record<string, number>;
  // Running pods first; a paused pod still counts as yours until it closes.
  const paused = (m: { pod: unknown }) => ((m.pod as { status: string }).status === "paused" ? 1 : 0);
  const best = (data ?? []).sort((a, b) => paused(a) - paused(b) || rank[a.status] - rank[b.status])[0];
  return best?.pod_id ?? null;
}

export function dayWeekday(date: string): Weekday {
  return weekdayOf(date) as Weekday;
}

export function minutesUntil(date: string, time: string | null): number | null {
  if (!time) return null;
  const now = vancouverNow();
  if (date !== now.date) return null;
  return toMinutes(time) - now.minutes;
}

export { nearestArea };
