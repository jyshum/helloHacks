import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/profile";
import { menuUserFor } from "@/lib/menu";
import PodsForYou, { type MyPod } from "@/components/pods/PodsForYou";
import { arriveOn, fromMinutes } from "@/lib/pods/time";
import { driverPod } from "@/lib/pods/match";
import type { Weekday } from "@/lib/pods/types";

export const dynamic = "force-dynamic";

// Commuter home: the pods you're in, plus pods for any days you still need.
export default async function PodsPage() {
  const me = await requireProfile();
  const admin = createAdminClient();
  const { data: profile } = await admin.from("commute_profiles").select("mode, active, home_area, arrive_by, days").eq("user_id", me.id).maybeSingle();

  // Drivers run one pod, running or paused (a paused driver's commute is inactive).
  if (profile?.mode === "driver") {
    const pod = await driverPod(me.id);
    if (pod) redirect(`/pods/${pod.id}`);
  }
  if (!profile || !profile.active) redirect("/commute");

  const { data: rows } = await admin
    .from("pod_members")
    .select("pod_id, status, days, pod:pods!inner(status, campus_label, driver_id, driver:users!pods_driver_id_fkey(id, full_name, photo_url))")
    .eq("user_id", me.id)
    .eq("role", "rider")
    .in("status", ["active", "requested"])
    .in("pod.status", ["active", "paused"]);

  type PodRow = { status: string; campus_label: string; driver_id: string; driver: { id: string; full_name: string; photo_url: string | null } };
  const driverIds = (rows ?? []).map((r) => (r.pod as unknown as PodRow).driver_id);
  const { data: dps } = driverIds.length
    ? await admin.from("commute_profiles").select("user_id, arrive_by, day_times").in("user_id", driverIds)
    : { data: [] };
  const myPods: MyPod[] = (rows ?? []).map((r) => {
    const pod = r.pod as unknown as PodRow;
    const dp = dps?.find((x) => x.user_id === pod.driver_id);
    const times = dp ? Array.from(new Set((r.days as Weekday[]).map((d) => arriveOn({ arrive_by: dp.arrive_by, day_times: dp.day_times ?? {} }, d)))) : [];
    return {
      podId: r.pod_id,
      status: pod.status === "paused" ? "paused" : (r.status as MyPod["status"]),
      days: r.days as number[],
      campus: pod.campus_label,
      arriveBy: times.length ? fromMinutes(times[0]) : null,
      varies: times.length > 1,
      driver: pod.driver,
    };
  });
  // A paused pod doesn't cover its days, so riders can pick a backup pod meanwhile.
  const covered = new Set(myPods.filter((p) => p.status !== "paused").flatMap((p) => p.days));
  const openDays = (profile.days as number[]).filter((d) => !covered.has(d));

  return <PodsForYou me={menuUserFor(me)} area={profile.home_area ?? "Home"} arriveBy={profile.arrive_by} myPods={myPods} openDays={openDays} />;
}
