import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { podAccess } from "@/lib/pods/access";
import { pausePod, resumePod } from "@/lib/pods/match";

export const dynamic = "force-dynamic";

// Driver pauses driving (POST) or resumes (DELETE). Riders keep their spots either way.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const a = await podAccess(params.id);
  if (!a.ok) return jsonError(a.error, a.status);
  if (!a.isDriver) return jsonError("Only the driver can pause the pod.", 403);
  const r = await pausePod(a.me.id);
  if ("error" in r) return jsonError(r.error, 409);
  return NextResponse.json({ ok: true, podId: r.podId });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const a = await podAccess(params.id);
  if (!a.ok) return jsonError(a.error, a.status);
  if (!a.isDriver) return jsonError("Only the driver can resume the pod.", 403);
  const r = await resumePod(a.me.id);
  if ("error" in r) return jsonError(r.error, 409);
  return NextResponse.json({ ok: true, podId: r.podId });
}
