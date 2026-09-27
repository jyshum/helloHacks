// SHARED CONTRACT: Partner A calls notify(); Partner B implements delivery:
// web push to every saved browser, then email (except chat) to anyone push didn't reach.
import webpush from "web-push";
import nodemailer, { type Transporter } from "nodemailer";
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
  | "ride_paid" // (driver) a rider's payment landed in your wallet
  | "pod_paused" // (riders) the driver paused driving; spots are held
  | "pod_resumed" // (riders) the driver is driving again
  | "chat"; // new pod chat message

export type Notice = {
  kind: NoticeKind;
  title: string;
  body: string;
  url: string; // in-app path to open, e.g. /pods/<id>
};

// Time-sensitive notices skip the push service's low-power batching.
const URGENT: NoticeKind[] = ["driver_late", "driver_missed", "trip_cancelled"];
// Frequent notices that would be too noisy as email (push only).
const QUIET: NoticeKind[] = ["chat", "ride_paid"];
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
    // Only real sign-ups (they have a login). Seeded demo users have made-up UBC
    // addresses that could belong to real students, so they must never get email or push.
    const { data: real } = await createAdminClient()
      .from("users")
      .select("id")
      .in("id", Array.from(new Set(userIds.filter(Boolean))))
      .not("auth_id", "is", null);
    const ids = (real ?? []).map((u) => u.id as string);
    if (!ids.length) return;
    const pushed = await sendPush(ids, notice);
    // Email anyone the push didn't reach, except for quiet kinds (too noisy for email).
    const emailTo = QUIET.includes(notice.kind) ? [] : ids.filter((id) => !pushed.has(id));
    const emailed = emailTo.length ? await sendEmail(emailTo, notice) : 0;
    console.log(`[notify] ${notice.kind} → ${ids.length} user(s), push ${pushed.size}, email ${emailed}: ${notice.title}`);
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

// --- Email fallback (Gmail SMTP as hoppedinn@gmail.com) ---

let mailer: Transporter | null | undefined;
function getMailer(): Transporter | null {
  if (mailer !== undefined) return mailer;
  const { SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn("[notify] email disabled: SMTP_USER / SMTP_PASS missing");
    return (mailer = null);
  }
  mailer = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
  return mailer;
}

// One email per user (never a shared To: list). Returns how many were accepted.
async function sendEmail(userIds: string[], notice: Notice): Promise<number> {
  const transport = getMailer();
  if (!transport) return 0;
  const { data: users } = await createAdminClient().from("users").select("id, ubc_email, full_name").in("id", userIds);
  if (!users?.length) return 0;

  const link = appUrl() ? `${appUrl()}${notice.url}` : null;
  const results = await Promise.allSettled(
    users
      .filter((u) => u.ubc_email)
      .map((u) =>
        transport.sendMail({
          from: `hoppedIn <${process.env.SMTP_USER}>`,
          to: u.ubc_email,
          subject: notice.title,
          text: [notice.body, link ? `Open hoppedIn: ${link}` : ""].filter(Boolean).join("\n\n"),
          html: emailHtml(notice, link, u.full_name?.split(" ")[0] ?? null),
        })
      )
  );
  results.forEach((r) => r.status === "rejected" && console.warn(`[notify] email failed: ${(r.reason as Error)?.message ?? r.reason}`));
  return results.filter((r) => r.status === "fulfilled").length;
}

function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return url.replace(/\/$/, "");
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Table layout + inline styles so it renders in Gmail, Outlook and Apple Mail.
function emailHtml(notice: Notice, link: string | null, firstName: string | null): string {
  const button = link
    ? `<tr><td style="padding:8px 32px 32px">
         <a href="${escapeHtml(link)}" style="display:inline-block;background:#002145;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:999px">Open hoppedIn</a>
       </td></tr>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F5F8FC;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0B1B2E">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F8FC;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #DCE4EE;border-radius:20px;overflow:hidden">
        <tr><td style="background:#002145;padding:18px 32px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.2px">hoppedIn</td></tr>
        <tr><td style="padding:28px 32px 8px">
          ${firstName ? `<p style="margin:0 0 8px;font-size:14px;color:#6B7C93">Hi ${escapeHtml(firstName)},</p>` : ""}
          <h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:#002145">${escapeHtml(notice.title)}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#0B1B2E">${escapeHtml(notice.body)}</p>
        </td></tr>
        ${button}
      </table>
      <p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#6B7C93">
        You're getting this because you're in a hoppedIn commute pod. Turn on notifications in the app to get these as alerts instead of email.
      </p>
    </td></tr>
  </table>
</body></html>`;
}