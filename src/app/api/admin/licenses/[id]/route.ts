import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { isAdmin } from "@/lib/admin";
import { jsonError } from "@/lib/api";

// Approve or reject a pending license review.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const me = await getProfile();
  if (!me || !isAdmin(me)) return jsonError("Not found.", 404);
  const { action, reason } = await req.json();
  if (action !== "approve" && action !== "reject") return jsonError("Invalid action.", 400);
  if (action === "reject" && !String(reason ?? "").trim()) return jsonError("Give a reason so the driver can fix it.", 400);

  const admin = createAdminClient();
  const { data: review } = await admin.from("license_reviews").select("id, user_id, status").eq("id", params.id).maybeSingle();
  if (!review) return jsonError("Review not found.", 404);
  if (review.status !== "pending") return jsonError(`Already ${review.status}.`, 409);

  const { error } = await admin
    .from("license_reviews")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      reject_reason: action === "reject" ? String(reason).trim() : null,
      reviewed_by: me.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.id);
  if (error) return jsonError(error.message, 500);
  await admin.from("users").update({ license_verified: action === "approve" }).eq("id", review.user_id);
  return NextResponse.json({ ok: true });
}
