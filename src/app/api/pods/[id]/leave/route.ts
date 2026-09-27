import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import { podAccess } from "@/lib/pods/access";
import { postSystemMessage } from "@/lib/pods/chat";
import { fillDriverPod, rematchUser } from "@/lib/pods/match";

// Rider leaves (driver refills the seat). Driver leaving = stop driving: pod closes.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const a = await podAccess(params.id);
  if (!a.ok) return jsonError(a.error, a.status);
  if (!a.member || !["active", "requested", "invited"].includes(a.member.status)) return jsonError("You're not in this pod.", 409);
  const admin = createAdminClient();

  if (a.isDriver) {
    await admin.from("commute_profiles").update({ active: false }).eq("user_id", a.me.id);
    await rematchUser(a.me.id); // archives the pod, releases + rematches riders
    return NextResponse.json({ ok: true });
  }
  await admin.from("pod_members").update({ status: "left", updated_at: new Date().toISOString() }).eq("id", a.member.id);
  if (a.member.status === "active") await postSystemMessage(params.id, `${a.me.full_name.split(" ")[0]} left the pod.`);
  await fillDriverPod(a.pod.driver_id);
  return NextResponse.json({ ok: true });
}
