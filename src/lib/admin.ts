import type { User } from "@/lib/types";

// Team members who can review driver licenses. Set ADMIN_EMAILS (comma-separated).
export function isAdmin(user: Pick<User, "ubc_email"> | null): boolean {
  if (!user) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(user.ubc_email.toLowerCase());
}
