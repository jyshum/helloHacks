import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { freshSince } from "@/lib/quote";

export const dynamic = "force-dynamic";

// The trip I'm currently in (as rider or driver), so home can link back to it.
export async function GET() {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const admin = createAdminClient();

  const { data: asRider } = await admin
    .from("ride_requests")
    .select("id, status, ride:rides(status, driver:users!rides_driver_id_fkey(full_name))")
    .eq("rider_id", me.id)
    .in("status", ["pending", "accepted"])
    .gte("created_at", freshSince())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (asRider) {
    const ride = asRider.ride as unknown as { status: string; driver: { full_name: string } | null };
    if (ride?.status !== "completed" && ride?.status !== "cancelled") {
      return NextResponse.json({ trip: { requestId: asRider.id, role: "rider", status: asRider.status, otherName: ride?.driver?.full_name ?? "your driver" } });
    }
  }

  const { data: myRides } = await admin
    .from("rides")
    .select("id")
    .eq("driver_id", me.id)
    .in("status", ["posted", "active"])
    .gte("departure_time", freshSince());
  if (myRides?.length) {
    const { data: accepted } = await admin
      .from("ride_requests")
      .select("id, rider:users!ride_requests_rider_id_fkey(full_name)")
      .in("ride_id", myRides.map((r) => r.id))
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (accepted) {
      const rider = accepted.rider as unknown as { full_name: string } | null;
      return NextResponse.json({ trip: { requestId: accepted.id, role: "driver", status: "accepted", otherName: rider?.full_name ?? "your rider" } });
    }
  }
  return NextResponse.json({ trip: null });
}
