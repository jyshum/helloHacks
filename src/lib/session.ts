import type { User as AuthUser } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

// If Supabase has confirmed the email, mirror it onto our users row.
// Covers the cross-device case where the link is clicked on another browser.
export async function syncVerified(
  authUser: AuthUser
): Promise<{ verified: boolean; role: Role | null; licenseVerified: boolean }> {
  const admin = createAdminClient();
  const confirmed = !!authUser.email_confirmed_at;
  if (confirmed) {
    await admin.from("users").update({ email_verified: true }).eq("auth_id", authUser.id);
  }
  const { data } = await admin
    .from("users")
    .select("email_verified, role, license_verified")
    .eq("auth_id", authUser.id)
    .maybeSingle();
  return {
    verified: !!data?.email_verified,
    role: (data?.role as Role) ?? null,
    licenseVerified: !!data?.license_verified,
  };
}

// Where a verified user goes next. Drivers verify their license first.
export function nextPathFor(role: Role | null, licenseVerified: boolean): string {
  if ((role === "driver" || role === "both") && !licenseVerified) return "/driver-verify";
  return "/map";
}
