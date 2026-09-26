import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";

const ALLOWED = ["posted", "active", "completed", "cancelled"];

// Driver moves their ride through posted → active → completed.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const { status } = await req.json();
  if (!ALLOWED.includes(status)) return jsonError("Invalid status.", 400);

  const admin = createAdminClient();
  const { data: ride } = await admin.from("rides").select("driver_id").eq("id", params.id).maybeSingle();
  if (!ride) return jsonError("Ride not found.", 404);
  if (ride.driver_id !== me.id) return jsonError("Not your ride.", 403);

  const { error } = await admin.from("rides").update({ status }).eq("id", params.id);
  if (error) return jsonError(error.message, 500);
  if (status === "completed") {
    await admin.from("ride_requests").update({ status: "completed" }).eq("ride_id", params.id).eq("status", "accepted");
  }
  return NextResponse.json({ ok: true });
}
