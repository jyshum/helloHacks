import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { addDays, arriveOn, prettyTime, vancouverNow, weekdayOf, fromMinutes } from "@/lib/pods/time";
import { getOrCreateTrip } from "@/lib/pods/trips";
import { closePod, PAUSE_HOLD_DAYS } from "@/lib/pods/match";
import type { Weekday } from "@/lib/pods/types";

export const dynamic = "force-dynamic";

// Runs every evening (vercel.json). Asks each driver whether they're driving tomorrow.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const tomorrow = addDays(vancouverNow().date, 1);
  const wd = weekdayOf(tomorrow) as Weekday;
  const { data: pods } = await admin.from("pods").select("id, driver_id").eq("status", "active");
  let asked = 0;

  for (const pod of pods ?? []) {
    const { data: dp } = await admin.from("commute_profiles").select("*").eq("user_id", pod.driver_id).eq("active", true).maybeSingle();
    if (!dp || !dp.days.includes(wd)) continue;
    const { data: riding } = await admin.from("pod_members").select("days").eq("pod_id", pod.id).eq("role", "rider").eq("status", "active");
    const count = (riding ?? []).filter((m) => (m.days as number[]).includes(wd)).length;
    if (!count) continue; // nobody riding that day

    const trip = await getOrCreateTrip(admin, pod.id, tomorrow);
    if (trip.status !== "scheduled") continue;
    await notify([pod.driver_id], {
      kind: "trip_confirm_ask",
      title: "Driving your pod tomorrow?",
      body: `${count} ${count === 1 ? "rider is" : "riders are"} counting on you for ${prettyTime(fromMinutes(arriveOn(dp, wd)))} arrival. Tap to confirm.`,
      url: `/pods/${pod.id}`,
    });
    asked++;
  }
  // Paused pods hold riders' spots for PAUSE_HOLD_DAYS, then close so riders get re-matched.
  const cutoff = new Date(Date.now() - PAUSE_HOLD_DAYS * 86400000).toISOString();
  const { data: stale } = await admin.from("pods").select("id").eq("status", "paused").lt("paused_at", cutoff);
  for (const p of stale ?? []) {
    await closePod(p.id, `The pod was paused for ${PAUSE_HOLD_DAYS} days, so it has closed. We're finding everyone a new pod.`);
  }

  return NextResponse.json({ ok: true, date: tomorrow, asked, closedPaused: stale?.length ?? 0 });
}
