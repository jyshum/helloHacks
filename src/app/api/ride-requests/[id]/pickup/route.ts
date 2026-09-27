import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";

// Driver ticks off a rider as picked up. The first pickup starts the trip.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const admin = createAdminClient();
  const { data: rr } = await admin.from("ride_requests").select("id, ride_id, status, ride:rides(driver_id, status)").eq("id", params.id).maybeSingle();
  if (!rr) return jsonError("Rider not found.", 404);
  const ride = rr.ride as unknown as { driver_id: string; status: string };
  if (ride.driver_id !== me.id) return jsonError("Only the driver can do this.", 403);
  if (rr.status !== "accepted") return jsonError("This rider isn't on the trip.", 409);

  await admin.from("ride_requests").update({ picked_up_at: new Date().toISOString() }).eq("id", rr.id);
  if (ride.status === "posted") await admin.from("rides").update({ status: "active" }).eq("id", rr.ride_id);
  return NextResponse.json({ ok: true });
}
