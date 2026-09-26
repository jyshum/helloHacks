import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/auth";
import type { Role } from "@/lib/types";

// Signup runs server-side so we can insert the users row and upload the photo
// before the email is confirmed (no session exists yet, so RLS would block it).
export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const fullName = String(form.get("full_name") ?? "").trim();
  const faculty = String(form.get("faculty") ?? "") || null;
  const yearRaw = String(form.get("year") ?? "");
  const year = yearRaw ? Number(yearRaw) : null;
  const role = (String(form.get("role") ?? "both") as Role);
  const photo = form.get("photo");

  if (!isAllowedEmail(email)) {
    return NextResponse.json({ error: "Use your UBC email (student.ubc.ca, ubc.ca, or alumni.ubc.ca)." }, { status: 400 });
  }
  if (!fullName) return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  if (!["driver", "rider", "both"].includes(role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/verify/callback`,
      data: { full_name: fullName, role },
    },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const authUser = data.user;
  // Supabase returns a user with no identities when the email is already registered.
  if (!authUser || authUser.identities?.length === 0) {
    return NextResponse.json({ error: "That email already has an account. Try logging in." }, { status: 409 });
  }

  const admin = createAdminClient();
  let photoUrl: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    const ext = (photo.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${authUser.id}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("avatars")
      .upload(path, photo, { contentType: photo.type || "image/jpeg", upsert: true });
    if (!upErr) photoUrl = admin.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }

  const { error: insertErr } = await admin.from("users").upsert(
    {
      auth_id: authUser.id,
      ubc_email: email,
      email_verified: false,
      full_name: fullName,
      faculty,
      year,
      photo_url: photoUrl,
      role,
    },
    { onConflict: "ubc_email" }
  );
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
