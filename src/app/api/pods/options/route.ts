import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { podOptions } from "@/lib/pods/match";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export type PodCard = {
  podId: string;
  invited: boolean;
  driver: { id: string; full_name: string; photo_url: string | null; faculty: string | null; year: number | null; rating_avg: number; license_verified: boolean };
  car: { make_model: string; color: string; photo_url: string | null } | null;
  area: string | null;
  campus: string;
  riders: { id: string; full_name: string; photo_url: string | null }[];
  seatsLeft: number;
  days: number[];
  pickupLabel: string;
  pickupTime: string;
  driveMinutes: number;
  transitMinutes: number | null;
};

// "Pods for you": the rider's best few options, ready to render.
export async function GET() {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const options = await podOptions(me.id, 6);
  if (!options.length) return NextResponse.json({ pods: [] });

  const admin = createAdminClient();
  const podIds = options.map((o) => o.podId);
  const driverIds = options.map((o) => o.driverId);
  const [{ data: drivers }, { data: cars }, { data: profiles }, { data: members }] = await Promise.all([
    admin.from("users").select("id, full_name, photo_url, faculty, year, rating_avg, license_verified").in("id", driverIds),
    admin.from("vehicles").select("user_id, make_model, color, photo_url").in("user_id", driverIds),
    admin.from("commute_profiles").select("user_id, home_area, campus_label, seats").in("user_id", driverIds),
    admin
      .from("pod_members")
      .select("pod_id, user_id, status, user:users!pod_members_user_id_fkey(id, full_name, photo_url)")
      .in("pod_id", podIds)
      .eq("role", "rider")
      .in("status", ["invited", "requested", "active"]),
  ]);

  const pods: PodCard[] = options.map((o) => {
    const d = drivers!.find((x) => x.id === o.driverId)!;
    const p = profiles?.find((x) => x.user_id === o.driverId);
    const inPod = (members ?? []).filter((m) => m.pod_id === o.podId);
    const taken = inPod.filter((m) => m.user_id !== me.id).length;
    return {
      podId: o.podId,
      invited: inPod.some((m) => m.user_id === me.id && m.status === "invited"),
      driver: { ...d, rating_avg: Number(d.rating_avg ?? 5), license_verified: !!d.license_verified },
      car: cars?.find((c) => c.user_id === o.driverId) ?? null,
      area: p?.home_area ?? null,
      campus: p?.campus_label ?? "UBC",
      riders: inPod
        .filter((m) => m.status === "active")
        .map((m) => m.user as unknown as PodCard["riders"][number])
        .filter(Boolean),
      seatsLeft: (p?.seats ?? 3) - taken,
      days: o.fit.days,
      pickupLabel: o.fit.pickupLabel,
      pickupTime: o.fit.pickupTime,
      driveMinutes: o.fit.driveMinutes,
      transitMinutes: o.fit.transitMinutes,
    };
  });
  // Pods that invited you first, then best fit.
  pods.sort((a, b) => Number(b.invited) - Number(a.invited));
  return NextResponse.json({ pods });
}
