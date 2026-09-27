import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { isAdmin } from "@/lib/admin";
import { loadReviews } from "@/lib/reviews";
import AdminReviews from "@/components/admin/AdminReviews";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await requireProfile();
  if (!isAdmin(me)) notFound();
  const initial = await loadReviews();
  return <AdminReviews initial={initial} />;
}
