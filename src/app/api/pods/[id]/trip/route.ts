import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import { podAccess } from "@/lib/pods/access";
import { postSystemMessage } from "@/lib/pods/chat";
import { notify } from "@/lib/notify";
import { cancelTrip, confirmTrip, getOrCreateTrip, startTrip } from "@/lib/pods/trips";

// Day-of controls. Driver: confirm | cancel | start. Rider: late | missed.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await podAccess(params.id);
  if (!a.ok) return jsonError(a.error, a.status);
  if (a.member?.status !== "active") return jsonError("You're not in this pod.", 403);
  const { action, date, leaveAt } = await req.json();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return jsonError("Invalid date.", 400);
  const driverOnly = ["confirm", "cancel", "start"].includes(action);
  if (driverOnly && !a.isDriver) return jsonError("Only the driver can do this.", 403);

  const admin = createAdminClient();
  const first = a.me.full_name.split(" ")[0];

  switch (action) {
    case "confirm":
      await confirmTrip(params.id, date, first, leaveAt ?? null);
      break;
    case "cancel":
      await cancelTrip(params.id, date, first);
      break;
    case "start":
      await startTrip(params.id, date);
      break;
    case "late": {
      // Rider nudge when the driver hasn't left ~10 min before pickup. Sent once per trip.
      const trip = await getOrCreateTrip(admin, params.id, date);
      if (!trip.late_notified_at && !["live", "completed", "cancelled"].includes(trip.status)) {
        await admin.from("pod_trips").update({ late_notified_at: new Date().toISOString() }).eq("id", trip.id);
        await postSystemMessage(params.id, "The driver hasn't started yet. Driver, can you post an update?");
        await notify([a.pod.driver_id], { kind: "driver_late", title: "Your pod is waiting", body: "Tap Start pickup when you leave, or let them know you can't drive.", url: `/pods/${params.id}` });
      }
      break;
    }
    case "missed": {
      // Rider reports the driver never showed. Counts against the driver's reliability.
      const trip = await getOrCreateTrip(admin, params.id, date);
      if (!["live", "completed", "cancelled", "missed"].includes(trip.status)) {
        await admin.from("pod_trips").update({ status: "missed" }).eq("id", trip.id);
        await postSystemMessage(params.id, `${first} reported the driver didn't show up today.`);
        const { data: riders } = await admin.from("pod_members").select("user_id").eq("pod_id", params.id).eq("role", "rider").eq("status", "active");
        await notify((riders ?? []).map((r) => r.user_id).filter((id) => id !== a.me.id), {
          kind: "driver_missed",
          title: "Looks like no pod ride today",
          body: "Open the app for other ways to get to campus.",
          url: `/pods/${params.id}`,
        });
      }
      break;
    }
    default:
      return jsonError("Invalid action.", 400);
  }
  return NextResponse.json({ ok: true });
}
