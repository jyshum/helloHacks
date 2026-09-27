import { createAdminClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/profile";
import CommuteOnboarding from "@/components/pods/CommuteOnboarding";
import type { CommuteProfile } from "@/lib/pods/types";

export const dynamic = "force-dynamic";

export default async function CommutePage() {
  const me = await requireProfile();
  const { data } = await createAdminClient().from("commute_profiles").select("*").eq("user_id", me.id).maybeSingle();
  return (
    <CommuteOnboarding
      firstName={(me.full_name ?? "there").split(" ")[0]}
      existing={(data as CommuteProfile) ?? null}
      licenseVerified={!!me.license_verified}
    />
  );
}
