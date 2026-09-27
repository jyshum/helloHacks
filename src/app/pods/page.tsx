import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/profile";
import { menuUserFor } from "@/lib/menu";
import PodsForYou, { type MyPod } from "@/components/pods/PodsForYou";

export const dynamic = "force-dynamic";

// Commuter home: the pods you're in, plus pods for any days you still need.
export default async function PodsPage() {
  const me = await requireProfile();
  const admin = createAdminClient();
  const { data: profile } = await admin.from("commute_profiles").select("mode, active, home_area, arrive_by, days").eq("user_id", me.id).maybeSingle();
  if (!profile || !profile.active) redirect("/commute");

  // Drivers run one pod.
  if (profile.mode === "driver") {
    const { data: pod } = await admin.from("pods").select("id").eq("driver_id", me.id).eq("status", "active").maybeSingle();
    if (pod) redirect(`/pods/${pod.id}`);
  }

  const { data: rows } = await admin
    .from("pod_members")
    .select("pod_id, status, days, pod:pods!inner(status, driver:users!pods_driver_id_fkey(id, full_name, photo_url))")
    .eq("user_id", me.id)
    .eq("role", "rider")
    .in("status", ["active", "requested"])
    .eq("pod.status", "active");

  const myPods: MyPod[] = (rows ?? []).map((r) => {
    const pod = r.pod as unknown as { driver: { id: string; full_name: string; photo_url: string | null } };
    return { podId: r.pod_id, status: r.status as MyPod["status"], days: r.days as number[], driver: pod.driver };
  });
  const covered = new Set(myPods.flatMap((p) => p.days));
  const openDays = (profile.days as number[]).filter((d) => !covered.has(d));

  return <PodsForYou me={menuUserFor(me)} area={profile.home_area ?? "Home"} arriveBy={profile.arrive_by} myPods={myPods} openDays={openDays} />;
}
