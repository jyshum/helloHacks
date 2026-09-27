import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { isLatLng, jsonError } from "@/lib/api";
import { nearestArea } from "@/lib/areas";
import { haversineKm } from "@/lib/geo";
import { rematchUser } from "@/lib/pods/match";
import { myPodId } from "@/lib/pods/load";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // matching calls Google a few times

export async function GET() {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const { data } = await createAdminClient().from("commute_profiles").select("*").eq("user_id", me.id).maybeSingle();
  return NextResponse.json({ profile: data ?? null });
}

// Save the 3 onboarding answers, then (re)match.
export async function PUT(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const b = await req.json();

  if (b.mode !== "driver" && b.mode !== "rider") return jsonError("Choose driving or riding.", 400);
  if (!isLatLng(b.home)) return jsonError("Add where you commute from.", 400);
  if (!isLatLng(b.campus)) return jsonError("Choose where on campus.", 400);
  const days = Array.isArray(b.days) ? b.days.map(Number).filter((d: number) => d >= 1 && d <= 5) : [];
  if (!days.length) return jsonError("Pick at least one day.", 400);
  if (!/^\d{2}:\d{2}$/.test(String(b.arrive_by))) return jsonError("Pick an arrival time.", 400);
  const dayTimes: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.day_times ?? {})) {
    if (days.includes(Number(k)) && /^\d{2}:\d{2}$/.test(String(v))) dayTimes[k] = String(v);
  }

  // Ride home (drivers, optional): a default leave time + per-day overrides.
  const drivesHome = b.mode === "driver" && /^\d{2}:\d{2}$/.test(String(b.home_leave_at ?? ""));
  const homeDayTimes: Record<string, string> = {};
  if (drivesHome) {
    for (const [k, v] of Object.entries(b.home_day_times ?? {})) {
      if (days.includes(Number(k)) && /^\d{2}:\d{2}$/.test(String(v))) homeDayTimes[k] = String(v);
    }
  }

  const admin = createAdminClient();
  const { data: prev } = await admin.from("commute_profiles").select("home_lat, home_lng, campus_lat, campus_lng").eq("user_id", me.id).maybeSingle();
  const moved =
    !prev ||
    haversineKm({ lat: prev.home_lat, lng: prev.home_lng }, b.home) > 0.05 ||
    haversineKm({ lat: prev.campus_lat, lng: prev.campus_lng }, b.campus) > 0.05;

  const { error } = await admin.from("commute_profiles").upsert({
    user_id: me.id,
    mode: b.mode,
    home_lat: b.home.lat,
    home_lng: b.home.lng,
    home_area: nearestArea(b.home),
    campus_lat: b.campus.lat,
    campus_lng: b.campus.lng,
    campus_label: String(b.campus_label ?? "UBC Bus Exchange"),
    days: days.sort(),
    arrive_by: b.arrive_by,
    day_times: dayTimes,
    home_leave_at: drivesHome ? b.home_leave_at : null,
    home_day_times: homeDayTimes,
    seats: Math.min(6, Math.max(1, Number(b.seats) || 3)),
    active: true,
    updated_at: new Date().toISOString(),
    ...(moved ? { route_polyline: null, route_minutes: null } : {}),
  });
  if (error) return jsonError(error.message, 500);

  await rematchUser(me.id);
  return NextResponse.json({ ok: true, podId: await myPodId(me.id) });
}
