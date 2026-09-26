import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import type { RideRequest } from "@/lib/types";

type Next = RideRequest["status"];

// Only the driver of the ride can accept/decline; either party can complete.
export async function setRequestStatus(requestId: string, next: Next) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);

  const admin = createAdminClient();
  const { data: rr } = await admin
    .from("ride_requests")
    .select("id, status, rider_id, ride:rides(id, driver_id, seats_available)")
    .eq("id", requestId)
    .maybeSingle();
  if (!rr) return jsonError("Request not found.", 404);
  const ride = rr.ride as unknown as { id: string; driver_id: string; seats_available: number };

  const isDriver = ride.driver_id === me.id;
  const isRider = rr.rider_id === me.id;
  if (next === "completed" ? !(isDriver || isRider) : !isDriver) return jsonError("Not allowed.", 403);

  if (next === "accepted") {
    if (rr.status !== "pending") return jsonError(`Request is already ${rr.status}.`, 409);
    if (ride.seats_available <= 0) return jsonError("No seats left.", 409);
    await admin.from("rides").update({ seats_available: ride.seats_available - 1 }).eq("id", ride.id);
  }

  const { error } = await admin.from("ride_requests").update({ status: next }).eq("id", requestId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true, rideId: ride.id });
}
