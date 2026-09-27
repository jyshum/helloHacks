import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import { podAccess } from "@/lib/pods/access";
import { postSystemMessage } from "@/lib/pods/chat";
import { notify } from "@/lib/notify";
import { dayWord } from "@/lib/pods/time";

// Rider: "Can't make it" (POST) or "I'm coming after all" (DELETE) for one date.
async function handle(req: Request, podId: string, skip: boolean) {
  const a = await podAccess(podId);
  if (!a.ok) return jsonError(a.error, a.status);
  if (a.member?.status !== "active" || a.isDriver) return jsonError("Only riders in this pod can do this.", 403);
  const { date } = await req.json();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return jsonError("Invalid date.", 400);

  const admin = createAdminClient();
  const first = a.me.full_name.split(" ")[0];
  const when = dayWord(date);
  if (skip) {
    await admin.from("pod_skips").upsert({ pod_id: podId, user_id: a.me.id, trip_date: date });
    await postSystemMessage(podId, `${first} can't make it ${when}.`);
    await notify([a.pod.driver_id], { kind: "trip_cancelled", title: `${first} is skipping ${when}`, body: "No need to stop for them.", url: `/pods/${podId}` });
  } else {
    await admin.from("pod_skips").delete().eq("pod_id", podId).eq("user_id", a.me.id).eq("trip_date", date);
    await postSystemMessage(podId, `${first} is coming ${when} after all.`);
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(req, params.id, true);
}
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return handle(req, params.id, false);
}
