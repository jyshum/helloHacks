import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";

export async function POST(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const { ride_id, ratee_id, score, comment } = await req.json();
  const s = Number(score);
  if (!ride_id || !ratee_id || !(s >= 1 && s <= 5)) return jsonError("Ride, ratee and a 1-5 score are required.", 400);
  if (ratee_id === me.id) return jsonError("You can't rate yourself.", 400);

  const admin = createAdminClient();
  const { error } = await admin.from("ratings").insert({
    ride_id,
    rater_id: me.id,
    ratee_id,
    score: s,
    comment: comment?.trim() || null,
  });
  if (error) return jsonError(error.message, 500);

  // Recompute the ratee's running average.
  const { data: ratee } = await admin.from("users").select("rating_avg, rating_count").eq("id", ratee_id).single();
  if (ratee) {
    const count = (ratee.rating_count ?? 0) + 1;
    const avg = ((Number(ratee.rating_avg ?? 5) * (count - 1)) + s) / count;
    await admin.from("users").update({ rating_avg: Math.round(avg * 100) / 100, rating_count: count }).eq("id", ratee_id);
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
