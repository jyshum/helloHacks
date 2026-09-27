import { createAdminClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/profile";
import SettingsView, { type SettingsData } from "@/components/settings/SettingsView";

export const dynamic = "force-dynamic";

// Your account after sign-up: profile details you can edit, plus links to your
// commute, car and licence (which have their own editors).
export default async function SettingsPage({ searchParams }: { searchParams: { saved?: string } }) {
  const me = await requireProfile();
  const admin = createAdminClient();
  const [{ data: commute }, { data: vehicle }, { data: review }] = await Promise.all([
    admin.from("commute_profiles").select("mode, active, home_area, days, arrive_by, campus_label").eq("user_id", me.id).maybeSingle(),
    admin.from("vehicles").select("make_model, color, license_plate").eq("user_id", me.id).maybeSingle(),
    admin.from("license_reviews").select("status").eq("user_id", me.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const data: SettingsData = {
    id: me.id,
    email: me.ubc_email,
    full_name: me.full_name,
    faculty: me.faculty,
    year: me.year,
    photo_url: me.photo_url,
    chat_preference: me.chat_preference,
    rating_avg: Number(me.rating_avg ?? 5),
    rating_count: me.rating_count ?? 0,
    commute: commute
      ? {
          mode: commute.mode,
          active: commute.active,
          area: commute.home_area,
          days: commute.days as number[],
          arriveBy: commute.arrive_by,
          campus: commute.campus_label,
        }
      : null,
    vehicle: vehicle ? `${vehicle.color ?? ""} ${vehicle.make_model ?? ""}`.trim() + (vehicle.license_plate ? ` · ${vehicle.license_plate}` : "") : null,
    license: me.license_verified ? "verified" : (review?.status as "pending" | "rejected" | undefined) ?? "none",
  };
  return <SettingsView data={data} justSaved={searchParams.saved === "1"} />;
}
