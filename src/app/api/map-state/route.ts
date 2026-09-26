import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { MapDriver, MapRider } from "@/lib/demo";
import { getProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

// Everything the map needs in one call. Uses the admin client because
// users RLS only lets people read their own row.
export async function GET() {
  if (!(await getProfile())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const admin = createAdminClient();

  const [ridesRes, reqsRes] = await Promise.all([
    admin
      .from("rides")
      .select("*, driver:users!rides_driver_id_fkey(id, full_name, faculty)")
      .in("status", ["posted", "active"])
      .order("departure_time", { ascending: true })
      .limit(50),
    admin
      .from("ride_requests")
      .select("*, rider:users!ride_requests_rider_id_fkey(id, full_name, faculty)")
      .eq("status", "pending")
      .limit(50),
  ]);

  if (ridesRes.error || reqsRes.error) {
    return NextResponse.json({ error: ridesRes.error?.message ?? reqsRes.error?.message }, { status: 500 });
  }

  const drivers: MapDriver[] = (ridesRes.data ?? []).map((r) => ({
    id: r.id,
    driverId: r.driver_id,
    name: r.driver?.full_name ?? "Driver",
    faculty: r.driver?.faculty ?? null,
    originLabel: r.origin_label ?? "",
    destinationLabel: r.destination_label ?? "",
    origin: { lat: r.origin_lat, lng: r.origin_lng },
    destination: { lat: r.destination_lat, lng: r.destination_lng },
    seats: r.seats_available,
  }));

  const riders: MapRider[] = (reqsRes.data ?? []).map((q) => ({
    id: q.id,
    riderId: q.rider_id,
    name: q.rider?.full_name ?? "Rider",
    faculty: q.rider?.faculty ?? null,
    pickup: { lat: q.pickup_lat, lng: q.pickup_lng },
    pickupLabel: q.pickup_label ?? "",
  }));

  return NextResponse.json({ drivers, riders });
}
