import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/profile";
import { myPodId } from "@/lib/pods/load";
import { menuUserFor } from "@/lib/menu";
import { haversineKm } from "@/lib/geo";
import { toMinutes } from "@/lib/pods/time";
import NoPod from "@/components/pods/NoPod";

export const dynamic = "force-dynamic";

// Home for commuters: your pod if you have one, onboarding if you haven't answered yet.
export default async function PodsPage() {
  const me = await requireProfile();
  const admin = createAdminClient();
  const { data: profile } = await admin.from("commute_profiles").select("*").eq("user_id", me.id).maybeSingle();
  if (!profile || !profile.active) redirect("/commute");

  const podId = await myPodId(me.id);
  if (podId) redirect(`/pods/${podId}`);

  // No pod yet: show how many people nearby are waiting too (it's not just you).
  const { data: others } = await admin.from("commute_profiles").select("home_lat, home_lng, arrive_by, mode").eq("active", true).neq("user_id", me.id);
  const nearby = (others ?? []).filter(
    (o) =>
      haversineKm({ lat: o.home_lat, lng: o.home_lng }, { lat: profile.home_lat, lng: profile.home_lng }) <= 4 &&
      Math.abs(toMinutes(o.arrive_by) - toMinutes(profile.arrive_by)) <= 30
  );
  return (
    <NoPod
      me={menuUserFor(me)}
      area={profile.home_area ?? "your area"}
      arriveBy={profile.arrive_by}
      nearbyRiders={nearby.filter((o) => o.mode === "rider").length}
    />
  );
}
