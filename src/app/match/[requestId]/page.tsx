import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { loadTrip } from "@/lib/trip";
import MatchView from "@/components/trip/MatchView";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: { requestId: string } }) {
  const me = await requireProfile();
  const trip = await loadTrip(params.requestId);
  if (!trip) notFound();
  const viewer = trip.driver.id === me.id ? "driver" : trip.rider.id === me.id ? "rider" : null;
  if (!viewer) notFound();
  return <MatchView trip={trip} viewer={viewer} />;
}
