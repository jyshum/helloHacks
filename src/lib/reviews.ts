import { createAdminClient } from "@/lib/supabase/server";

const URL_TTL = 60 * 60; // signed links last an hour

export type AdminReview = {
  id: string;
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewer: string | null;
  user: { id: string; full_name: string; ubc_email: string; faculty: string | null; year: number | null; photo_url: string | null };
  vehicle: { make_model: string; license_plate: string; province: string; color: string; photo_url: string | null } | null;
  licenseUrl: string | null;
  selfieUrl: string | null;
  recordUrl: string | null;
  recordIsPdf: boolean;
};

// Pending reviews (oldest first) plus the most recent decisions, with signed file links.
export async function loadReviews(): Promise<{ pending: AdminReview[]; recent: AdminReview[] }> {
  const admin = createAdminClient();
  const sel =
    "*, user:users!license_reviews_user_id_fkey(id, full_name, ubc_email, faculty, year, photo_url), reviewer:users!license_reviews_reviewed_by_fkey(full_name)";
  const [{ data: pending }, { data: recent }] = await Promise.all([
    admin.from("license_reviews").select(sel).eq("status", "pending").order("created_at", { ascending: true }).limit(50),
    admin.from("license_reviews").select(sel).neq("status", "pending").order("reviewed_at", { ascending: false, nullsFirst: false }).limit(10),
  ]);
  const rows = [...(pending ?? []), ...(recent ?? [])];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: vehicles } = userIds.length
    ? await admin.from("vehicles").select("user_id, make_model, license_plate, province, color, photo_url").in("user_id", userIds)
    : { data: [] };

  const paths = rows.flatMap((r) => [r.license_path, r.selfie_path, r.record_path].filter(Boolean)) as string[];
  const { data: signed } = paths.length
    ? await admin.storage.from("licenses").createSignedUrls(paths, URL_TTL)
    : { data: [] };
  const url = (p: string | null) => (p ? signed?.find((s) => s.path === p)?.signedUrl ?? null : null);

  const shape = (r: (typeof rows)[number]): AdminReview => ({
    id: r.id,
    status: r.status,
    reject_reason: r.reject_reason,
    created_at: r.created_at,
    reviewed_at: r.reviewed_at,
    reviewer: r.reviewer?.full_name ?? null,
    user: r.user,
    vehicle: vehicles?.find((v) => v.user_id === r.user_id) ?? null,
    licenseUrl: url(r.license_path),
    selfieUrl: url(r.selfie_path),
    recordUrl: url(r.record_path),
    recordIsPdf: !!r.record_path?.endsWith(".pdf"),
  });
  return { pending: (pending ?? []).map(shape), recent: (recent ?? []).map(shape) };
}
