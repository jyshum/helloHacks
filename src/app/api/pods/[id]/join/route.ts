import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import { podAccess } from "@/lib/pods/access";
import { notify } from "@/lib/notify";
import { postSystemMessage } from "@/lib/pods/chat";

// Rider accepts an invite → waits for the driver's approval.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const a = await podAccess(params.id);
  if (!a.ok) return jsonError(a.error, a.status);
  if (a.member?.status !== "invited") return jsonError("This invite is no longer open.", 409);
  const admin = createAdminClient();
  // Demo (seeded) drivers have no login, so nobody could approve: let riders straight in.
  const { data: driver } = await admin.from("users").select("auth_id, full_name").eq("id", a.pod.driver_id).single();
  if (!driver?.auth_id) {
    await admin.from("pod_members").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", a.member.id);
    await postSystemMessage(a.pod.id, `${a.me.full_name} joined the pod.`);
    return NextResponse.json({ ok: true, approved: true });
  }
  await admin.from("pod_members").update({ status: "requested", updated_at: new Date().toISOString() }).eq("id", a.member.id);
  await notify([a.pod.driver_id], {
    kind: "pod_request",
    title: `${a.me.full_name} wants to join your pod`,
    body: "Check their profile and approve in one tap.",
    url: `/pods/${a.pod.id}`,
  });
  return NextResponse.json({ ok: true });
}
