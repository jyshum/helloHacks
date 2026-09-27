import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { uploadFile } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// My latest license review (the driver-verify screen polls this).
export async function GET() {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const { data } = await createAdminClient()
    .from("license_reviews")
    .select("id, status, reject_reason, created_at, reviewed_at")
    .eq("user_id", me.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ review: data ?? null, licenseVerified: !!me.license_verified });
}

// Submit license photo + selfie holding it (+ optional ICBC record) for team review.
export async function POST(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const form = await req.formData();
  const stamp = Date.now();
  const base = `${me.id}/${stamp}`;

  let license: string | null, selfie: string | null, record: string | null;
  try {
    license = await uploadFile("licenses", `${base}-license`, form.get("license"));
    selfie = await uploadFile("licenses", `${base}-selfie`, form.get("selfie"));
    record = await uploadFile("licenses", `${base}-record`, form.get("record"), { allowPdf: true });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
  if (!license || !selfie) return jsonError("Add a photo of your license and a selfie holding it.", 400);

  const admin = createAdminClient();
  // A new submission replaces any older pending one.
  await admin.from("license_reviews").update({ status: "rejected", reject_reason: "Replaced by a newer submission" }).eq("user_id", me.id).eq("status", "pending");
  const { data, error } = await admin
    .from("license_reviews")
    .insert({ user_id: me.id, license_path: license, selfie_path: selfie, record_path: record, status: "pending" })
    .select("id, status, reject_reason, created_at, reviewed_at")
    .single();
  if (error) return jsonError(error.message, 500);
  await admin.from("users").update({ license_verified: false }).eq("id", me.id);
  return NextResponse.json({ review: data }, { status: 201 });
}
