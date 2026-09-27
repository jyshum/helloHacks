import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";

type SubscriptionJSON = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

// Save this browser's push subscription (PushSubscription.toJSON()) for the signed-in user.
export async function POST(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const sub = (await req.json().catch(() => ({}))) as SubscriptionJSON;
  if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) {
    return jsonError("Invalid push subscription.", 400);
  }
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert({ user_id: me.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, { onConflict: "endpoint" });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true }, { status: 201 });
}

// Turn notifications off for this browser.
export async function DELETE(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const { endpoint } = (await req.json().catch(() => ({}))) as SubscriptionJSON;
  if (!endpoint) return jsonError("Endpoint is required.", 400);
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", me.id);
  return NextResponse.json({ ok: true });
}
