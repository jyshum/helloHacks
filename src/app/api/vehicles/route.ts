import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";

// One vehicle per driver for the demo: replaces any existing one.
export async function POST(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);

  const b = await req.json();
  const make_model = String(b.make_model ?? "").trim();
  const license_plate = String(b.license_plate ?? "").trim().toUpperCase();
  if (!make_model || !license_plate) return jsonError("Make/model and plate are required.", 400);

  const admin = createAdminClient();
  await admin.from("vehicles").delete().eq("user_id", me.id);
  const { data, error } = await admin
    .from("vehicles")
    .insert({
      user_id: me.id,
      make_model,
      license_plate,
      province: String(b.province ?? "BC"),
      color: String(b.color ?? "").trim(),
      seat_capacity: Number(b.seat_capacity) || 3,
      is_ev: !!b.is_ev,
    })
    .select()
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ vehicle: data }, { status: 201 });
}
