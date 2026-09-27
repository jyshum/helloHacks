import { NextResponse } from "next/server";
import { getProfile } from "@/lib/profile";
import { isAdmin } from "@/lib/admin";
import { jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/server";
import { loadReports } from "@/components/pods/chat/reports";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getProfile();
  if (!isAdmin(me)) return jsonError("Not found.", 404);
  return NextResponse.json(await loadReports());
}

// { id, action: "dismiss" | "remove" }. "remove" deletes the message from the pod chat;
// either way every open report on that message is marked resolved.
export async function POST(req: Request) {
  const me = await getProfile();
  if (!isAdmin(me)) return jsonError("Not found.", 404);
  const { id, action } = await req.json().catch(() => ({}));
  if (!id || !["dismiss", "remove"].includes(action)) return jsonError("Report id and action are required.", 400);

  const admin = createAdminClient();
  const { data: report } = await admin.from("pod_reports").select("id, message_id").eq("id", id).maybeSingle();
  if (!report) return jsonError("Report not found.", 404);

  if (report.message_id) {
    await admin.from("pod_reports").update({ resolved: true }).eq("message_id", report.message_id);
    if (action === "remove") {
      const { error } = await admin.from("pod_messages").delete().eq("id", report.message_id);
      if (error) return jsonError(error.message, 500);
    }
  } else {
    await admin.from("pod_reports").update({ resolved: true }).eq("id", id);
  }
  return NextResponse.json({ ok: true });
}
