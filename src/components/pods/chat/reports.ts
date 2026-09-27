// Server-only: loads chat reports for /admin with the service-role client.
import { createAdminClient } from "@/lib/supabase/server";

type Person = { id: string; full_name: string | null; photo_url: string | null; ubc_email: string };

export type AdminReport = {
  id: string;
  pod_id: string;
  message_id: string | null; // null once the message has been removed
  reason: string;
  message_body: string | null;
  resolved: boolean;
  created_at: string;
  reporter: Person | null;
  reported: Person | null;
};

export type ReportsData = { open: AdminReport[]; recent: AdminReport[] };

const SELECT =
  "id, pod_id, message_id, reason, message_body, resolved, created_at, " +
  "reporter:users!pod_reports_reporter_id_fkey(id, full_name, photo_url, ubc_email), " +
  "reported:users!pod_reports_message_user_id_fkey(id, full_name, photo_url, ubc_email)";

export async function loadReports(): Promise<ReportsData> {
  const admin = createAdminClient();
  const [open, recent] = await Promise.all([
    admin.from("pod_reports").select(SELECT).eq("resolved", false).order("created_at", { ascending: false }).limit(50),
    admin.from("pod_reports").select(SELECT).eq("resolved", true).order("created_at", { ascending: false }).limit(10),
  ]);
  return {
    open: (open.data ?? []) as unknown as AdminReport[],
    recent: (recent.data ?? []) as unknown as AdminReport[],
  };
}
