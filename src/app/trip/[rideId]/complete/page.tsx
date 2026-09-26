import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/profile";
import { loadTrip } from "@/lib/trip";
import CompleteView from "@/components/trip/CompleteView";

export const dynamic = "force-dynamic";

export default async function TripCompletePage({
  params,
  searchParams,
}: {
  params: { rideId: string };
  searchParams: { request?: string };
}) {
  const me = await requireProfile();

  // Find the request this viewer is part of on this ride.
  let requestId = searchParams.request;
  if (!requestId) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ride_requests")
      .select("id, rider_id")
      .eq("ride_id", params.rideId)
      .in("status", ["accepted", "completed"])
      .order("created_at", { ascending: true });
    requestId = (data?.find((r) => r.rider_id === me.id) ?? data?.[0])?.id;
  }
  if (!requestId) notFound();

  const trip = await loadTrip(requestId);
  if (!trip || trip.ride.id !== params.rideId) notFound();
  const viewer = trip.driver.id === me.id ? "driver" : trip.rider.id === me.id ? "rider" : null;
  if (!viewer) notFound();

  return <CompleteView trip={trip} viewer={viewer} />;
}
