import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { fitFor } from "@/lib/pods/match";
import { arriveOn, fromMinutes } from "@/lib/pods/time";
import { closestPointOnPath, decodePolyline } from "@/lib/geo";
import type { Weekday } from "@/lib/pods/types";

export const dynamic = "force-dynamic";

// A pod as it would be for you, before joining: who's in, and how it fits your week.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const res = await fitFor(me.id, params.id);
  if ("error" in res) return jsonError(res.error, 409);
  const { fit, driver: dp, rider: rp } = res;

  const admin = createAdminClient();
  const [{ data: driver }, { data: car }, { data: members }, { data: trips }, { data: pod }] = await Promise.all([
    admin.from("users").select("id, full_name, photo_url, faculty, year, rating_avg, rating_count, license_verified").eq("id", dp.user_id).single(),
    admin.from("vehicles").select("make_model, color, photo_url, is_ev").eq("user_id", dp.user_id).maybeSingle(),
    admin
      .from("pod_members")
      .select("days, user:users!pod_members_user_id_fkey(id, full_name, photo_url, faculty, year)")
      .eq("pod_id", params.id)
      .eq("role", "rider")
      .eq("status", "active")
      .neq("user_id", me.id),
    admin.from("pod_trips").select("status").eq("pod_id", params.id).in("status", ["completed", "missed"]),
    admin.from("pods").select("campus_label, campus_lat, campus_lng").eq("id", params.id).single(),
  ]);

  // Route shown only from your pickup onwards, so the driver's home isn't revealed.
  let route: { lat: number; lng: number }[] = [];
  if (dp.route_polyline) {
    const path = decodePolyline(dp.route_polyline);
    const from = closestPointOnPath(fit.pickup, path);
    route = [fit.pickup, ...path.slice(from.index + 1)];
  }

  const day = fit.days[0] as Weekday;
  return NextResponse.json({
    podId: params.id,
    campus: pod?.campus_label ?? dp.campus_label,
    campusPos: pod ? { lat: pod.campus_lat, lng: pod.campus_lng } : null,
    driver: { ...driver, rating_avg: Number(driver?.rating_avg ?? 5), license_verified: !!driver?.license_verified },
    car: car ?? null,
    reliability: {
      completed: (trips ?? []).filter((t) => t.status === "completed").length,
      total: (trips ?? []).length,
    },
    riders: (members ?? []).map((m) => m.user).filter(Boolean),
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
    route,
    me: { faculty: me.faculty, year: me.year },
  });
}
