import { isAdmin } from "@/lib/admin";
import type { MenuUser } from "@/components/app/ProfileMenu";
import type { User } from "@/lib/types";

export function menuUserFor(me: User): MenuUser {
  return {
    id: me.id,
    full_name: me.full_name ?? "UBC student",
    photo_url: me.photo_url,
    role: me.role,
    rating_avg: Number(me.rating_avg ?? 5),
    license_verified: !!me.license_verified,
    isAdmin: isAdmin(me),
  };
}
