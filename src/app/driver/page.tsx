import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/profile";
import DriverDashboard from "@/components/driver/DriverDashboard";

export const dynamic = "force-dynamic";

export default async function DriverPage() {
  const me = await requireProfile();
  if (me.role === "rider") redirect("/map");

  const admin = createAdminClient();
  const { data: rides } = await admin
    .from("rides")
    .select("*")
    .eq("driver_id", me.id)
    .in("status", ["posted", "active"])
    .order("created_at", { ascending: false });

  const rideIds = (rides ?? []).map((r) => r.id);
  const { data: requests } = rideIds.length
    ? await admin
        .from("ride_requests")
        .select("*, rider:users!ride_requests_rider_id_fkey(id, full_name, faculty, year, photo_url, rating_avg, rating_count)")
        .in("ride_id", rideIds)
        .in("status", ["pending", "accepted"])
        .order("created_at", { ascending: true })
    : { data: [] };

  return <DriverDashboard me={me} rides={rides ?? []} requests={requests ?? []} />;
}
