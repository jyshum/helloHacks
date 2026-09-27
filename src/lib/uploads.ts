import { createAdminClient } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

// Uploads a form file to a storage bucket. Returns the stored path, or throws a user-facing message.
export async function uploadFile(bucket: string, path: string, file: FormDataEntryValue | null, opts: { allowPdf?: boolean } = {}) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_BYTES) throw new Error("Each file must be under 10 MB.");
  const type = file.type || "image/jpeg";
  if (!ALLOWED.includes(type) || (type === "application/pdf" && !opts.allowPdf)) {
    throw new Error("Upload a photo (JPG, PNG, HEIC) or a PDF for the driving record.");
  }
  const ext = (file.name.split(".").pop() || (type === "application/pdf" ? "pdf" : "jpg")).toLowerCase();
  const fullPath = `${path}.${ext}`;
  const { error } = await createAdminClient().storage.from(bucket).upload(fullPath, file, { contentType: type, upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return fullPath;
}
