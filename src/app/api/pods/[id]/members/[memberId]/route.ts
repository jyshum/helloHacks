import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import { podAccess } from "@/lib/pods/access";
import { notify } from "@/lib/notify";
import { postSystemMessage } from "@/lib/pods/chat";
import { fillDriverPod, matchRider } from "@/lib/pods/match";

// Driver approves or declines a rider's request.
export async function POST(req: Request, { params }: { params: { id: string; memberId: string } }) {
  const a = await podAccess(params.id);
  if (!a.ok) return jsonError(a.error, a.status);
  if (!a.isDriver) return jsonError("Only the driver can do this.", 403);
  const { action } = await req.json();
  if (action !== "approve" && action !== "decline") return jsonError("Invalid action.", 400);

  const admin = createAdminClient();
  const { data: m } = await admin
    .from("pod_members")
    .select("id, user_id, status, user:users!pod_members_user_id_fkey(full_name)")
    .eq("id", params.memberId)
    .eq("pod_id", params.id)
    .maybeSingle();
  if (!m) return jsonError("Rider not found.", 404);
  if (m.status !== "requested") return jsonError("This request was already handled.", 409);
  const name = (m.user as unknown as { full_name: string } | null)?.full_name ?? "A rider";

  await admin
    .from("pod_members")
    .update({ status: action === "approve" ? "active" : "declined", updated_at: new Date().toISOString() })
    .eq("id", m.id);

  if (action === "approve") {
    await postSystemMessage(params.id, `👋 ${name} joined the pod.`);
    await notify([m.user_id], {
      kind: "pod_approved",
      title: "You're in the pod! 🎉",
      body: `${a.me.full_name} approved you. Say hi in the pod chat.`,
      url: `/pods/${params.id}`,
    });
  } else {
    await notify([m.user_id], {
      kind: "pod_declined",
      title: "That pod didn't work out",
      body: "We're looking for another pod for you.",
      url: "/pods",
    });
    await matchRider(m.user_id);
    await fillDriverPod(a.me.id);
  }
  return NextResponse.json({ ok: true });
}
