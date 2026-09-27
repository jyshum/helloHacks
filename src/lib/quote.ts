import { createAdminClient } from "@/lib/supabase/server";
import { calculateDetour, isValidMatch } from "@/lib/matching";
import { fareBetween } from "@/lib/pricing";
import { haversineKm, type LatLng } from "@/lib/geo";

// Rides that left more than this long ago are treated as stale and hidden.
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;
export const freshSince = () => new Date(Date.now() - STALE_AFTER_MS).toISOString();

export type RideOption = {
  rideId: string;
  driverId: string;
  driverName: string;
  driverPhoto: string | null;
  driverFaculty: string | null;
  driverYear: number | null;
  driverRating: number;
  driverRatingCount: number;
  licenseVerified: boolean;
  vehicle: { make_model: string; color: string; license_plate: string; is_ev: boolean } | null;
  origin: LatLng;
  originLabel: string;
  destinationLabel: string;
  seats: number;
  departureTime: string;
  detourMinutes: number;
  detourKm: number;
  estimatedCostCents: number;
  valid: boolean;
};

// Quotes posted rides for a pickup, closest origins first, sorted by detour.
export async function quoteRides(
  pickup: LatLng,
  opts: { rideId?: string | null; excludeDriverId?: string; limit?: number } = {}
): Promise<RideOption[]> {
  const admin = createAdminClient();
  let query = admin
    .from("rides")
    .select(
      "*, driver:users!rides_driver_id_fkey(id, full_name, photo_url, faculty, year, rating_avg, rating_count, license_verified)"
    )
    .eq("status", "posted")
    .gt("seats_available", 0)
    .gte("departure_time", freshSince());
  if (opts.rideId) query = query.eq("id", opts.rideId);
  const { data: rides } = await query.limit(60);
  if (!rides?.length) return [];

  const candidates = rides
    .filter((r) => r.driver_id !== opts.excludeDriverId)
    .map((r) => ({ r, d: haversineKm(pickup, { lat: r.origin_lat, lng: r.origin_lng }) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, opts.limit ?? 6)
    .map((c) => c.r);
  if (!candidates.length) return [];

  const { data: vehicles } = await admin
    .from("vehicles")
    .select("user_id, make_model, color, license_plate, is_ev")
    .in("user_id", candidates.map((r) => r.driver_id));

  const options = await Promise.all(
    candidates.map(async (r): Promise<RideOption> => {
      const { detourMinutes, detourKm } = await calculateDetour(
        { lat: r.origin_lat, lng: r.origin_lng },
        { lat: r.destination_lat, lng: r.destination_lng },
        pickup
      );
      const v = vehicles?.find((x) => x.user_id === r.driver_id);
      return {
        rideId: r.id,
        driverId: r.driver_id,
        driverName: r.driver?.full_name ?? "Driver",
        driverPhoto: r.driver?.photo_url ?? null,
        driverFaculty: r.driver?.faculty ?? null,
        driverYear: r.driver?.year ?? null,
        driverRating: Number(r.driver?.rating_avg ?? 5),
        driverRatingCount: r.driver?.rating_count ?? 0,
        licenseVerified: !!r.driver?.license_verified,
        vehicle: v ? { make_model: v.make_model, color: v.color, license_plate: v.license_plate, is_ev: v.is_ev } : null,
        origin: { lat: r.origin_lat, lng: r.origin_lng },
        originLabel: r.origin_label ?? "",
        destinationLabel: r.destination_label ?? "",
        seats: r.seats_available,
        departureTime: r.departure_time,
        detourMinutes,
        detourKm,
        estimatedCostCents: fareBetween(pickup, { lat: r.destination_lat, lng: r.destination_lng }).total,
        valid: isValidMatch(detourMinutes),
      };
    })
  );
  return options.sort((a, b) => Number(b.valid) - Number(a.valid) || a.detourMinutes - b.detourMinutes);
}

export async function quoteRide(pickup: LatLng, rideId: string | null, excludeDriverId?: string) {
  const [best] = await quoteRides(pickup, { rideId, excludeDriverId, limit: rideId ? 1 : 4 });
  return best ?? null;
}
