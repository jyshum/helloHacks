import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { dayStates, fitFor } from "@/lib/pods/match";
import { arriveOn, fromMinutes, leaveOn, pickupOn, toMinutes } from "@/lib/pods/time";
import { publicRouteStart } from "@/lib/pods/route";
import { fareBetween } from "@/lib/pricing";
import type { Weekday } from "@/lib/pods/types";

export const dynamic = "force-dynamic";

// A pod as it would be for you, before joining: who's in, and how it fits your week.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const res = await fitFor(me.id, params.id);
  if ("error" in res) return jsonError(res.error, 409);
  const { fit, driver: dp, rider: rp, profile, covered } = res;

  const admin = createAdminClient();
  const [{ data: driver }, { data: car }, { data: members }, { data: trips }, { data: pod }] = await Promise.all([
    admin.from("users").select("id, full_name, photo_url, faculty, year, rating_avg, rating_count, license_verified").eq("id", dp.user_id).single(),
    admin.from("vehicles").select("make_model, color, photo_url, is_ev").eq("user_id", dp.user_id).maybeSingle(),
    admin
      .from("pod_members")
      .select("days, pickup_lat, pickup_lng, pickup_time, user:users!pod_members_user_id_fkey(id, full_name, photo_url, faculty, year)")
      .eq("pod_id", params.id)
      .eq("role", "rider")
      .eq("status", "active")
      .neq("user_id", me.id),
    admin.from("pod_trips").select("status").eq("pod_id", params.id).in("status", ["completed", "missed"]),
    admin.from("pods").select("campus_label, campus_lat, campus_lng").eq("id", params.id).single(),
  ]);

  const campusPos = pod ? { lat: pod.campus_lat, lng: pod.campus_lng } : { lat: dp.campus_lat, lng: dp.campus_lng };

  // Every weekday, so you can tap any day. Days that work carry your times and the day's stops
  // in pickup order (so the map draws the pod's real drive). Other days say why not.
  const firstName = (driver?.full_name ?? "Driver").split(" ")[0];
  const DAYS = ["", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays"];
  const week = dayStates(dp, profile, fit.days, covered);
  const schedule = ([1, 2, 3, 4, 5] as Weekday[]).map((d) => {
    const drives = dp.days.includes(d);
    const others = (members ?? [])
      .filter((m) => drives && (m.days as number[]).includes(d) && m.pickup_lat != null)
      .map((m) => ({ lat: m.pickup_lat as number, lng: m.pickup_lng as number, me: false, time: pickupOn(m.pickup_time, dp, m.days as number[], d) ?? "99:99" }));
    const arriveBy = drives ? fromMinutes(arriveOn(dp, d)) : null;
    const youNeed = profile.days.includes(d) ? fromMinutes(arriveOn(profile, d)) : null;
    const ok = fit.days.includes(d);
    const mine = ok ? pickupOn(fit.pickupTime, dp, fit.days, d) ?? fit.pickupTime : null;
    const stops = [...others, ...(mine ? [{ lat: fit.pickup.lat, lng: fit.pickup.lng, me: true, time: mine }] : [])].sort((a, b) => a.time.localeCompare(b.time));
    let note: string | null = null;
    if (!drives) note = `${firstName} doesn't drive ${DAYS[d]}`;
    else if (!youNeed) note = `You don't commute ${DAYS[d]}`;
    else if (covered.includes(d)) note = "Your other pod has this day";
    else if (!ok) {
      const gap = arriveOn(profile, d) - arriveOn(dp, d);
      note = gap < 0 ? `Gets there ${-gap} min too late for you` : `Gets there ${gap} min too early for you`;
    }
    const leave = drives ? leaveOn({ home_leave_at: dp.home_leave_at, home_day_times: dp.home_day_times ?? {} }, d) : null;
    // Your arrival = your pickup + your time in the car (before the driver's "by" time).
    const arriveAt = mine ? fromMinutes(toMinutes(mine) + fit.driveMinutes) : null;
    return { day: d, arriveAt, state: week[d - 1].state, ok, note, homeLeave: leave == null ? null : fromMinutes(leave), drives, pickupTime: mine, arriveBy, youNeed, riders: others.length, stops: stops.map(({ lat, lng, me }) => ({ lat, lng, me })) };
  });

  const day = fit.days[0] as Weekday;
  return NextResponse.json({
    podId: params.id,
    campus: pod?.campus_label ?? dp.campus_label,
    campusPos,
    routeStart: publicRouteStart(dp.route_polyline, { lat: dp.home_lat, lng: dp.home_lng }),
    driver: { ...driver, rating_avg: Number(driver?.rating_avg ?? 5), license_verified: !!driver?.license_verified },
    car: car ?? null,
    reliability: {
      completed: (trips ?? []).filter((t) => t.status === "completed").length,
      total: (trips ?? []).length,
    },
    riders: (members ?? []).map((m) => ({ ...(m.user as unknown as object), days: m.days })).filter(Boolean),
    seatsLeft: dp.seats - (members ?? []).length,
    fit: {
      days: fit.days,
      pickup: fit.pickup,
      pickupLabel: fit.pickupLabel,
      pickupTime: fit.pickupTime,
      arriveBy: fromMinutes(arriveOn(dp, day)),
      youNeed: fromMinutes(arriveOn(rp, day)),
      driveMinutes: fit.driveMinutes,
      transitMinutes: fit.transitMinutes,
      detourMinutes: fit.detourMinutes,
    },
    schedule,
    fare: fareBetween(fit.pickup, campusPos),
    me: { faculty: me.faculty, year: me.year },
  });
}
