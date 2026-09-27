import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { FACULTIES } from "@/lib/auth";
import { uploadFile } from "@/lib/uploads";
import type { ChatPreference } from "@/lib/types";

export const dynamic = "force-dynamic";

const CHAT: ChatPreference[] = ["chatty", "quiet", "no_preference"];
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Edit your own profile after sign-up. Multipart so a new photo can come along.
// Fields: full_name, faculty, year, chat_preference, photo (file), remove_photo ("1").
// Email isn't editable here: it's the verified UBC identity the account hangs off.
export async function PATCH(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("Send the form as multipart.", 400);

  const update: Record<string, unknown> = {};

  if (form.has("full_name")) {
    const name = String(form.get("full_name") ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 60) return jsonError("Name must be 2–60 characters.", 400);
    update.full_name = name;
  }
  if (form.has("faculty")) {
    const faculty = String(form.get("faculty") ?? "");
    if (faculty && !(FACULTIES as readonly string[]).includes(faculty)) return jsonError("Pick a faculty from the list.", 400);
    update.faculty = faculty || null;
  }
  if (form.has("year")) {
    const raw = String(form.get("year") ?? "");
    const year = raw ? Number(raw) : null;
    if (year !== null && !(Number.isInteger(year) && year >= 1 && year <= 5)) return jsonError("Year must be 1–5.", 400);
    update.year = year;
  }
  if (form.has("chat_preference")) {
    const chat = String(form.get("chat_preference")) as ChatPreference;
    if (!CHAT.includes(chat)) return jsonError("Pick a ride vibe.", 400);
    update.chat_preference = chat;
  }

  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (!PHOTO_TYPES.includes(photo.type)) return jsonError("Use a JPG, PNG or WebP photo.", 400);
    try {
      const admin = createAdminClient();
      // Same name as the sign-up photo (keyed by login id), so a new photo replaces the old one.
      const authId = (me as typeof me & { auth_id?: string | null }).auth_id;
      const path = await uploadFile("avatars", authId ?? me.id, photo);
      if (path) {
        // Same file name each time, so bust the browser cache with a version.
        update.photo_url = `${admin.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
      }
    } catch (e) {
      return jsonError((e as Error).message, 400);
    }
  } else if (form.get("remove_photo") === "1") {
    update.photo_url = null;
  }

  if (!Object.keys(update).length) return jsonError("Nothing to save.", 400);
  const { data, error } = await createAdminClient()
    .from("users")
    .update(update)
    .eq("id", me.id)
    .select("full_name, faculty, year, chat_preference, photo_url")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true, profile: data });
}
