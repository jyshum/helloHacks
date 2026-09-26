import { createAdminClient } from "@/lib/supabase/server";
import { calculateDetour, isValidMatch } from "@/lib/matching";
import { calculateGasContribution } from "@/lib/pricing";
import { haversineKm, type LatLng } from "@/lib/geo";

export type Quote = {
  rideId: string;
  driverName: string;
  detourMinutes: number;
  detourKm: number;
  estimatedCostCents: number;
  valid: boolean;
};

// Quote one ride, or find the best posted ride for this pickup.
export async function quoteRide(pickup: LatLng, rideId: string | null, excludeDriverId?: string): Promise<Quote | null> {
  const admin = createAdminClient();
  let query = admin
    .from("rides")
    .select("*, driver:users!rides_driver_id_fkey(full_name)")
    .eq("status", "posted")
    .gt("seats_available", 0);
  if (rideId) query = query.eq("id", rideId);
  const { data: rides } = await query.limit(50);
  if (!rides?.length) return null;

  // Only call Directions for the few rides whose origin is closest to the pickup.
  const candidates = rides
    .filter((r) => r.driver_id !== excludeDriverId)
    .map((r) => ({ r, d: haversineKm(pickup, { lat: r.origin_lat, lng: r.origin_lng }) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 4)
    .map((c) => c.r);

  const quotes = await Promise.all(
    candidates.map(async (r) => {
      const { detourMinutes, detourKm } = await calculateDetour(
        { lat: r.origin_lat, lng: r.origin_lng },
        { lat: r.destination_lat, lng: r.destination_lng },
        pickup
      );
      return {
        rideId: r.id as string,
        driverName: (r.driver?.full_name as string) ?? "Driver",
        detourMinutes,
        detourKm,
        estimatedCostCents: calculateGasContribution(detourKm),
        valid: isValidMatch(detourMinutes),
      };
    })
  );
  quotes.sort((a, b) => a.detourMinutes - b.detourMinutes);
  return quotes[0] ?? null;
}
