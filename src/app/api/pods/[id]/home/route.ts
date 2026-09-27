import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import { podAccess } from "@/lib/pods/access";
import { leaveOn, vancouverNow, weekdayOf } from "@/lib/pods/time";
import type { Weekday } from "@/lib/pods/types";

export const dynamic = "force-dynamic";

// Rider taps "I'm in" (POST) or "Not today" (DELETE) for a day's ride home.
async function check(req: Request, podId: string) {
  const a = await podAccess(podId);
  if (!a.ok) return { error: jsonError(a.error, a.status) };
  if (a.isDriver || a.member?.role !== "rider" || a.member.status !== "active") return { error: jsonError("Only riders in this pod can ride home with it.", 403) };
  if (a.pod.status !== "active") return { error: jsonError("This pod is paused.", 409) };
  const { date } = await req.json().catch(() => ({}));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || date < vancouverNow().date) return { error: jsonError("Pick an upcoming day.", 400) };

  const admin = createAdminClient();
  const [{ data: dp }, { data: m }] = await Promise.all([
    admin.from("commute_profiles").select("home_leave_at, home_day_times, days").eq("user_id", a.pod.driver_id).single(),
    admin.from("pod_members").select("days").eq("pod_id", podId).eq("user_id", a.me.id).single(),
  ]);
  const wd = weekdayOf(date) as Weekday;
  if (!dp || leaveOn(dp, wd) == null || !(dp.days as number[]).includes(wd)) return { error: jsonError("The driver isn't driving home that day.", 409) };
  if (!(m?.days as number[] | undefined)?.includes(wd)) return { error: jsonError("That's not one of your pod days.", 409) };
  return { me: a.me, date: String(date) };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const c = await check(req, params.id);
  if ("error" in c) return c.error;
  const { error } = await createAdminClient().from("pod_home_rides").upsert({ pod_id: params.id, user_id: c.me.id, trip_date: c.date }, { onConflict: "pod_id,user_id,trip_date", ignoreDuplicates: true });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true, in: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const c = await check(req, params.id);
  if ("error" in c) return c.error;
  await createAdminClient().from("pod_home_rides").delete().eq("pod_id", params.id).eq("user_id", c.me.id).eq("trip_date", c.date);
  return NextResponse.json({ ok: true, in: false });
}
