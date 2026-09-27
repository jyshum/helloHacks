import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { uploadFile } from "@/lib/uploads";

// One vehicle per driver: replaces any existing one. Multipart so a car photo can come along.
export async function POST(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);

  const f = await req.formData();
  const make_model = String(f.get("make_model") ?? "").trim();
  const license_plate = String(f.get("license_plate") ?? "").trim().toUpperCase();
  if (!make_model || !license_plate) return jsonError("Make/model and plate are required.", 400);

  const admin = createAdminClient();
  const { data: existing } = await admin.from("vehicles").select("photo_url").eq("user_id", me.id).maybeSingle();

  let photo_url: string | null = existing?.photo_url ?? null;
  try {
    const path = await uploadFile("cars", `${me.id}/${Date.now()}`, f.get("photo"));
    if (path) photo_url = admin.storage.from("cars").getPublicUrl(path).data.publicUrl;
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
  if (!photo_url) return jsonError("Add a photo of your car with the plate visible.", 400);

  await admin.from("vehicles").delete().eq("user_id", me.id);
  const { data, error } = await admin
    .from("vehicles")
    .insert({
      user_id: me.id,
      make_model,
      license_plate,
      province: String(f.get("province") ?? "BC"),
      color: String(f.get("color") ?? "").trim(),
      seat_capacity: Number(f.get("seat_capacity")) || 3,
      is_ev: f.get("is_ev") === "on",
      photo_url,
    })
    .select()
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ vehicle: data }, { status: 201 });
}
