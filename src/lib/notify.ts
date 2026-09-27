// SHARED CONTRACT: Partner A calls notify(); Partner B implements delivery
// (web push first, email fallback).
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/server";

export type NoticeKind =
  | "pod_invite" // you've been matched into a pod
  | "pod_request" // (driver) a rider asked to join
  | "pod_approved" // (rider) the driver approved you
  | "pod_declined"
  | "trip_confirm_ask" // (driver) night-before "driving tomorrow?"
  | "trip_confirmed" // (riders) driver confirmed tomorrow
  | "trip_cancelled" // (riders) driver can't drive
  | "driver_late" // (riders) driver hasn't left yet
  | "driver_missed" // (riders) looks like driver isn't coming
  | "chat"; // new pod chat message

export type Notice = {
  kind: NoticeKind;
  title: string;
  body: string;
  url: string; // in-app path to open, e.g. /pods/<id>
};

// Time-sensitive notices skip the push service's low-power batching.
const URGENT: NoticeKind[] = ["driver_late", "driver_missed", "trip_cancelled"];
const SEND_TIMEOUT_MS = 5000;

let vapidReady: boolean | null = null;
function vapidConfigured(): boolean {
  if (vapidReady !== null) return vapidReady;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) throw new Error("VAPID env missing");
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidReady = true;
  } catch (e) {
    console.warn(`[notify] web push disabled: ${(e as Error).message}`);
    vapidReady = false;
  }
  return vapidReady;
}

// Server-only. userIds are users.id (not auth ids). Must never throw.
export async function notify(userIds: string[], notice: Notice): Promise<void> {
  try {
    const ids = Array.from(new Set(userIds.filter(Boolean)));
    if (!ids.length) return;
    const pushed = await sendPush(ids, notice);
    console.log(`[notify] ${notice.kind} → ${ids.length} user(s), push to ${pushed.size}: ${notice.title}`);
  } catch (e) {
    console.error(`[notify] ${notice.kind} failed:`, e);
  }
}

// Sends to every saved browser of each user. Returns the user ids that got at least one push.
async function sendPush(userIds: string[], notice: Notice): Promise<Set<string>> {
  const delivered = new Set<string>();
  if (!vapidConfigured()) return delivered;

  const admin = createAdminClient();
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (error || !subs?.length) return delivered;

  const payload = JSON.stringify({
    title: notice.title,
    body: notice.body,
    url: notice.url,
    // One notification per pod chat / per trip notice instead of a stack of them.
    tag: `${notice.kind === "chat" ? "chat" : "pod"}:${notice.url}`,
  });
  const gone: string[] = [];

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 60 * 60 * 12,
          urgency: URGENT.includes(notice.kind) ? "high" : "normal",
          timeout: SEND_TIMEOUT_MS,
        });
        delivered.add(s.user_id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410: the browser unsubscribed or the subscription expired.
        if (status === 404 || status === 410) gone.push(s.id);
        else console.warn(`[notify] push failed (${status ?? "network"}) for user ${s.user_id}`);
      }
    })
  );

  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  return delivered;
}
