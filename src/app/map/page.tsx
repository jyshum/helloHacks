import LiveMap from "@/components/map/LiveMap";
import { requireProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const me = await requireProfile();
  return (
    <LiveMap
      me={{ id: me.id, full_name: me.full_name ?? "UBC student", role: me.role, photo_url: me.photo_url, license_verified: !!me.license_verified }}
    />
  );
}
