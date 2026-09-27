import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import { podAccess } from "@/lib/pods/access";
import { fillDriverPod, matchRider } from "@/lib/pods/match";

// Rider says "not for me": never offered this pod again; look for another; refill the seat.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const a = await podAccess(params.id);
  if (!a.ok) return jsonError(a.error, a.status);
  if (a.member?.status !== "invited") return jsonError("This invite is no longer open.", 409);
  await createAdminClient().from("pod_members").update({ status: "declined", updated_at: new Date().toISOString() }).eq("id", a.member.id);
  const found = await matchRider(a.me.id);
  await fillDriverPod(a.pod.driver_id);
  return NextResponse.json({ ok: true, foundAnother: found });
}
