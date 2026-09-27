import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/profile";
import { menuUserFor } from "@/lib/menu";
import PodsForYou from "@/components/pods/PodsForYou";

export const dynamic = "force-dynamic";

// Commuter home: your pod if you're in one, otherwise pods to choose from.
export default async function PodsPage() {
  const me = await requireProfile();
  const admin = createAdminClient();
  const { data: profile } = await admin.from("commute_profiles").select("mode, active, home_area, arrive_by").eq("user_id", me.id).maybeSingle();
  if (!profile || !profile.active) redirect("/commute");

  const { data: mine } = await admin
    .from("pod_members")
    .select("pod_id, status, pod:pods!inner(status)")
    .eq("user_id", me.id)
    .in("status", ["active", "requested"])
    .eq("pod.status", "active")
    .order("status", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (mine) redirect(`/pods/${mine.pod_id}`);

  if (profile.mode === "driver") {
    const { data: pod } = await admin.from("pods").select("id").eq("driver_id", me.id).eq("status", "active").maybeSingle();
    if (pod) redirect(`/pods/${pod.id}`);
  }

  return <PodsForYou me={menuUserFor(me)} area={profile.home_area ?? "Home"} arriveBy={profile.arrive_by} />;
}
