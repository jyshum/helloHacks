import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { isLatLng, jsonError } from "@/lib/api";
import { MAX_DETOUR_MINUTES } from "@/lib/matching";
import { quoteRide } from "@/lib/quote";

export async function POST(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);

  const { ride_id, pickup, dropoff, pickup_label, dropoff_label } = await req.json();
  if (!isLatLng(pickup) || !isLatLng(dropoff)) return jsonError("Pickup and dropoff are required.", 400);

  const quote = await quoteRide(pickup, ride_id ?? null, me.id);
  if (!quote) return jsonError("No drivers heading that way right now.", 404);
  if (!quote.valid) {
    return NextResponse.json(
      { error: `That pickup adds ${quote.detourMinutes} min to the driver's trip. Max is ${MAX_DETOUR_MINUTES}.`, quote },
      { status: 422 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ride_requests")
    .insert({
      ride_id: quote.rideId,
      rider_id: me.id,
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      pickup_label: pickup_label ?? null,
      dropoff_lat: dropoff.lat,
      dropoff_lng: dropoff.lng,
      dropoff_label: dropoff_label ?? null,
      detour_minutes: quote.detourMinutes,
      detour_km: quote.detourKm,
      estimated_cost_cents: quote.estimatedCostCents,
      status: "pending",
    })
    .select()
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ request: data, quote }, { status: 201 });
}
