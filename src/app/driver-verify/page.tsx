import { createAdminClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/profile";
import DriverVerify from "@/components/driver/DriverVerify";
import type { Vehicle } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DriverVerifyPage() {
  const me = await requireProfile();
  const { data: vehicle } = await createAdminClient()
    .from("vehicles")
    .select("*")
    .eq("user_id", me.id)
    .maybeSingle();
  return <DriverVerify licenseVerified={!!me.license_verified} vehicle={(vehicle as Vehicle) ?? null} />;
}
