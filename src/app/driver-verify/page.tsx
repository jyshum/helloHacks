import { createAdminClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/profile";
import DriverVerify from "@/components/driver/DriverVerify";
import type { LicenseReview, Vehicle } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DriverVerifyPage() {
  const me = await requireProfile();
  const admin = createAdminClient();
  const [{ data: vehicle }, { data: review }] = await Promise.all([
    admin.from("vehicles").select("*").eq("user_id", me.id).maybeSingle(),
    admin
      .from("license_reviews")
      .select("id, user_id, status, reject_reason, created_at, reviewed_at")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return (
    <DriverVerify
      licenseVerified={!!me.license_verified}
      review={(review as LicenseReview) ?? null}
      vehicle={(vehicle as Vehicle) ?? null}
    />
  );
}
