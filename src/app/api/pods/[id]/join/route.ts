import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { podAccess } from "@/lib/pods/access";
import { notify } from "@/lib/notify";
import { postSystemMessage } from "@/lib/pods/chat";
import { requestToJoin } from "@/lib/pods/match";

// Rider picks this pod (from "Pods for you" or an invite).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const a = await podAccess(params.id);
  if (!a.ok) return jsonError(a.error, a.status);
  if (a.isDriver) return jsonError("You drive this pod.", 400);
  if (a.member && ["active", "requested"].includes(a.member.status)) return NextResponse.json({ ok: true, status: a.member.status });

  const r = await requestToJoin(a.me.id, params.id);
  if ("error" in r) return jsonError(r.error, 409);

  if (r.status === "active") {
    await postSystemMessage(params.id, `${a.me.full_name} joined the pod.`);
  } else {
    await notify([a.pod.driver_id], {
      kind: "pod_request",
      title: `${a.me.full_name} wants to join your pod`,
      body: "Check their profile and approve in one tap.",
      url: `/pods/${params.id}`,
    });
  }
  return NextResponse.json({ ok: true, status: r.status });
}
