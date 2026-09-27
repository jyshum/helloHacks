import { createAdminClient } from "@/lib/supabase/server";
import { haversineKm } from "@/lib/geo";
import { pickupOn, weekdayOf } from "@/lib/pods/time";
import type { Ride, RideRequest, User, Vehicle } from "@/lib/types";

// One rider stop on a ride, in pickup order.
export type Stop = {
  requestId: string;
  riderId: string;
  name: string;
  photo: string | null;
  pickup: { lat: number; lng: number };
  label: string;
  time: string | null; // "HH:MM" for pod rides
  pickedUp: boolean;
};

export type TripBundle = {
  request: RideRequest & { picked_up_at?: string | null };
  ride: Ride;
  driver: User;
  rider: User;
  vehicle: Vehicle | null;
  stops: Stop[]; // every rider on this ride (pods can have several)
  podId: string | null;
};

// Everything both sides of a match need, loaded with the admin client.
export async function loadTrip(requestId: string): Promise<TripBundle | null> {
  const admin = createAdminClient();
  const { data: request } = await admin.from("ride_requests").select("*").eq("id", requestId).maybeSingle();
  if (!request) return null;
  const { data: ride } = await admin.from("rides").select("*").eq("id", request.ride_id).maybeSingle();
  if (!ride) return null;
  const [{ data: driver }, { data: rider }, { data: vehicle }, { data: siblings }, { data: podTrip }] = await Promise.all([
    admin.from("users").select("*").eq("id", ride.driver_id).single(),
    admin.from("users").select("*").eq("id", request.rider_id).single(),
    admin.from("vehicles").select("*").eq("user_id", ride.driver_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin
      .from("ride_requests")
      .select("id, rider_id, pickup_lat, pickup_lng, pickup_label, picked_up_at, status, rider:users!ride_requests_rider_id_fkey(full_name, photo_url)")
      .eq("ride_id", ride.id)
      .in("status", ["accepted", "completed"]),
    admin.from("pod_trips").select("pod_id, trip_date").eq("ride_id", ride.id).maybeSingle(),
  ]);
  if (!driver || !rider) return null;

  // Pod rides have planned pickup times; order by those, else by distance from the start.
  const times = new Map<string, string>();
  if (podTrip?.pod_id) {
    const [{ data: members }, { data: dp }] = await Promise.all([
      admin.from("pod_members").select("user_id, pickup_time, days").eq("pod_id", podTrip.pod_id),
      admin.from("commute_profiles").select("arrive_by, day_times").eq("user_id", ride.driver_id).maybeSingle(),
    ]);
    const weekday = weekdayOf(podTrip.trip_date);
    (members ?? []).forEach((m) => {
      const t = dp ? pickupOn(m.pickup_time, { arrive_by: dp.arrive_by, day_times: dp.day_times ?? {} }, m.days as number[], weekday) : m.pickup_time;
      if (t) times.set(m.user_id, String(t).slice(0, 5));
    });
  }
  const origin = { lat: ride.origin_lat, lng: ride.origin_lng };
  const stops: Stop[] = (siblings ?? [])
    .map((s) => {
      const u = s.rider as unknown as { full_name: string; photo_url: string | null } | null;
      return {
        requestId: s.id,
        riderId: s.rider_id,
        name: u?.full_name ?? "Rider",
        photo: u?.photo_url ?? null,
        pickup: { lat: s.pickup_lat, lng: s.pickup_lng },
        label: s.pickup_label ?? "Pickup",
        time: times.get(s.rider_id) ?? null,
        pickedUp: !!s.picked_up_at,
      };
    })
    .sort((a, b) =>
      a.time && b.time ? a.time.localeCompare(b.time) : haversineKm(origin, a.pickup) - haversineKm(origin, b.pickup)
    );

  return { request, ride, driver, rider, vehicle: vehicle ?? null, stops, podId: podTrip?.pod_id ?? null } as TripBundle;
}
