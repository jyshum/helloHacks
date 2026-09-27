import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { isAdmin } from "@/lib/admin";
import { loadReviews } from "@/lib/reviews";
import { loadReports } from "@/components/pods/chat/reports";
import AdminReviews from "@/components/admin/AdminReviews";
import AdminReports from "@/components/admin/AdminReports";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await requireProfile();
  if (!isAdmin(me)) notFound();
  const [initial, reports] = await Promise.all([loadReviews(), loadReports()]);
  return (
    <AdminReviews initial={initial}>
      <AdminReports initial={reports} />
    </AdminReviews>
  );
}
