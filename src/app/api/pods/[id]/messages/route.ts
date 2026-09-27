import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { podChatMembers, podMembership } from "@/components/pods/chat/membership";
import { MAX_MESSAGE_LENGTH, type ChatMessage } from "@/components/pods/chat/types";

export const dynamic = "force-dynamic";

const SELECT = "id, pod_id, user_id, kind, body, created_at, sender:users!pod_messages_user_id_fkey(id, full_name, photo_url)";

// Last 100 messages (oldest first) plus the members, so the client can label live inserts.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const membership = await podMembership(params.id, me.id);
  if (!membership) return jsonError("You're not in this pod.", 403);

  const [{ data, error }, members] = await Promise.all([
    createAdminClient()
      .from("pod_messages")
      .select(SELECT)
      .eq("pod_id", params.id)
      .order("created_at", { ascending: false })
      .limit(100),
    podChatMembers(params.id),
  ]);
  if (error) return jsonError(error.message, 500);

  const messages = ((data ?? []) as unknown as ChatMessage[]).reverse();
  return NextResponse.json({ messages, members, canPost: membership.canPost });
}

// Only active members can post. Notifies the other active members.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const membership = await podMembership(params.id, me.id);
  if (!membership) return jsonError("You're not in this pod.", 403);
  if (!membership.canPost) return jsonError("You can chat once the driver approves you.", 403);

  const { body } = await req.json().catch(() => ({ body: "" }));
  const text = String(body ?? "").trim();
  if (!text) return jsonError("Message is empty.", 400);
  if (text.length > MAX_MESSAGE_LENGTH) return jsonError(`Keep it under ${MAX_MESSAGE_LENGTH} characters.`, 400);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pod_messages")
    .insert({ pod_id: params.id, user_id: me.id, kind: "user", body: text })
    .select(SELECT)
    .single();
  if (error) return jsonError(error.message, 500);

  const { data: others } = await admin
    .from("pod_members")
    .select("user_id")
    .eq("pod_id", params.id)
    .eq("status", "active")
    .neq("user_id", me.id);
  const first = (me.full_name ?? "Someone").split(" ")[0];
  await notify(
    (others ?? []).map((o) => o.user_id),
    {
      kind: "chat",
      title: `${first} in your pod`,
      body: text.length > 140 ? `${text.slice(0, 137)}...` : text,
      url: `/pods/${params.id}/chat`,
    }
  );

  return NextResponse.json({ message: data as unknown as ChatMessage }, { status: 201 });
}
