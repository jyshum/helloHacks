import Home from "@/components/app/Home";
import { requireProfile } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const me = await requireProfile();
  const { data: vehicle } = await createAdminClient()
    .from("vehicles")
    .select("seat_capacity")
    .eq("user_id", me.id)
    .maybeSingle();
  return (
    <Home
      me={{
        id: me.id,
        full_name: me.full_name ?? "UBC student",
        photo_url: me.photo_url,
        role: me.role,
        rating_avg: Number(me.rating_avg ?? 5),
        license_verified: !!me.license_verified,
        isAdmin: isAdmin(me),
        faculty: me.faculty,
        year: me.year,
        seatCapacity: vehicle?.seat_capacity ?? 3,
      }}
    />
  );
}
