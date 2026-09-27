import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { isAdmin } from "@/lib/admin";
import { fillDriverPod } from "@/lib/pods/match";
import { postSystemMessage } from "@/lib/pods/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Runs the real matching engine for every driver, e.g. after loading seed data.
// Auth: an admin session, or `Authorization: Bearer <CRON_SECRET>` for scripts.
// Seeded users (no login) can't tap Join/Approve, so:
//   seed driver + seed rider  → rider goes straight to 'active'
//   real driver + seed rider  → 'requested' (the real driver approves, good for demos)
//   seed driver + real rider  → stays 'invited' (Join auto-approves; see /join)
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bySecret = !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!bySecret && !isAdmin(await getProfile())) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const admin = createAdminClient();
  const { data: drivers } = await admin.from("commute_profiles").select("user_id").eq("mode", "driver").eq("active", true);
  let invited = 0;
  for (const d of drivers ?? []) invited += await fillDriverPod(d.user_id);

  const { data: seedUsers } = await admin.from("users").select("id").is("auth_id", null);
  const seed = new Set((seedUsers ?? []).map((u) => u.id));
  const { data: pending } = await admin
    .from("pod_members")
    .select("id, pod_id, user_id, pod:pods!inner(driver_id)")
    .eq("status", "invited")
    .eq("role", "rider");

  let activated = 0, requested = 0;
  for (const m of pending ?? []) {
    if (!seed.has(m.user_id)) continue;
    const driverId = (m.pod as unknown as { driver_id: string }).driver_id;
    if (seed.has(driverId)) {
      await admin.from("pod_members").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", m.id);
      const { data: u } = await admin.from("users").select("full_name").eq("id", m.user_id).single();
      await postSystemMessage(m.pod_id, `${u?.full_name ?? "A rider"} joined the pod.`);
      activated++;
    } else {
      await admin.from("pod_members").update({ status: "requested", updated_at: new Date().toISOString() }).eq("id", m.id);
      requested++;
    }
  }

  const { count: pods } = await admin.from("pods").select("id", { count: "exact", head: true }).eq("status", "active");
  return NextResponse.json({ ok: true, drivers: drivers?.length ?? 0, invited, activated, requested, pods });
}
