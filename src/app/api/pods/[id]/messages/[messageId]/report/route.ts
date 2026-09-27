import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { podMembership } from "@/components/pods/chat/membership";

// Report someone else's message for the team to review on /admin.
export async function POST(req: Request, { params }: { params: { id: string; messageId: string } }) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  if (!(await podMembership(params.id, me.id))) return jsonError("You're not in this pod.", 403);

  const { reason } = await req.json().catch(() => ({ reason: "" }));
  const text = String(reason ?? "").trim().slice(0, 500);
  if (!text) return jsonError("Pick a reason.", 400);

  const admin = createAdminClient();
  const { data: msg } = await admin
    .from("pod_messages")
    .select("id, pod_id, user_id, kind, body")
    .eq("id", params.messageId)
    .eq("pod_id", params.id)
    .maybeSingle();
  if (!msg) return jsonError("Message not found.", 404);
  if (msg.kind !== "user" || msg.user_id === me.id) return jsonError("You can only report other people's messages.", 400);

  const { error } = await admin.from("pod_reports").upsert(
    {
      pod_id: params.id,
      message_id: msg.id,
      reporter_id: me.id,
      reason: text,
      message_body: msg.body,
      message_user_id: msg.user_id,
    },
    { onConflict: "message_id,reporter_id", ignoreDuplicates: true }
  );
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true }, { status: 201 });
}
