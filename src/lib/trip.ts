import { createAdminClient } from "@/lib/supabase/server";
import type { Ride, RideRequest, User, Vehicle } from "@/lib/types";

export type TripBundle = {
  request: RideRequest;
  ride: Ride;
  driver: User;
  rider: User;
  vehicle: Vehicle | null;
};

// Everything both sides of a match need, loaded with the admin client.
export async function loadTrip(requestId: string): Promise<TripBundle | null> {
  const admin = createAdminClient();
  const { data: request } = await admin.from("ride_requests").select("*").eq("id", requestId).maybeSingle();
  if (!request) return null;
  const { data: ride } = await admin.from("rides").select("*").eq("id", request.ride_id).maybeSingle();
  if (!ride) return null;
  const [{ data: driver }, { data: rider }, { data: vehicle }] = await Promise.all([
    admin.from("users").select("*").eq("id", ride.driver_id).single(),
    admin.from("users").select("*").eq("id", request.rider_id).single(),
    admin.from("vehicles").select("*").eq("user_id", ride.driver_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!driver || !rider) return null;
  return { request, ride, driver, rider, vehicle: vehicle ?? null } as TripBundle;
}
