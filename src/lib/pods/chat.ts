import { createAdminClient } from "@/lib/supabase/server";

// SHARED CONTRACT: post an automatic update into a pod's group chat
// ("Priya confirmed for tomorrow 8:20"). Server-only. Partner B renders these.
export async function postSystemMessage(podId: string, body: string): Promise<void> {
  await createAdminClient().from("pod_messages").insert({ pod_id: podId, user_id: null, kind: "system", body });
}
