import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { freshSince } from "@/lib/quote";

export const dynamic = "force-dynamic";

// The driver's current ride (if online) plus its pending/accepted requests.
export async function GET() {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const admin = createAdminClient();
  const { data: ride } = await admin
    .from("rides")
    .select("*")
    .eq("driver_id", me.id)
    .in("status", ["posted", "active"])
    .gte("departure_time", freshSince())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ride) return NextResponse.json({ ride: null, requests: [] });

  const { data: requests } = await admin
    .from("ride_requests")
    .select("*, rider:users!ride_requests_rider_id_fkey(id, full_name, faculty, year, photo_url, rating_avg, rating_count)")
    .eq("ride_id", ride.id)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: true });
  return NextResponse.json({ ride, requests: requests ?? [] });
}
