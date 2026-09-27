import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import type { User } from "@/lib/types";

// Loads me + the pod + my membership row. Route handlers use this to authorize.
export async function podAccess(podId: string): Promise<
  | { ok: false; status: number; error: string }
  | { ok: true; me: User; pod: { id: string; driver_id: string; status: string }; member: { id: string; role: string; status: string } | null; isDriver: boolean }
> {
  const me = await getProfile();
  if (!me) return { ok: false, status: 401, error: "Sign in first." };
  const admin = createAdminClient();
  const { data: pod } = await admin.from("pods").select("id, driver_id, status").eq("id", podId).maybeSingle();
  if (!pod) return { ok: false, status: 404, error: "Pod not found." };
  const { data: member } = await admin.from("pod_members").select("id, role, status").eq("pod_id", podId).eq("user_id", me.id).maybeSingle();
  return { ok: true, me, pod, member: member ?? null, isDriver: pod.driver_id === me.id };
}
