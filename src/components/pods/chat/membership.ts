// Server-only: uses the service-role client. Never import from client components.
import { createAdminClient } from "@/lib/supabase/server";
import type { ChatMember } from "./types";

// Statuses that can read the chat (mirrors is_pod_member() in the pods migration).
export const READ_STATUSES = ["requested", "active"];

// The caller's membership in a pod, or null if they aren't in it.
export async function podMembership(podId: string, userId: string) {
  const { data } = await createAdminClient()
    .from("pod_members")
    .select("status")
    .eq("pod_id", podId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !READ_STATUSES.includes(data.status)) return null;
  return { status: data.status as string, canPost: data.status === "active" };
}

// Everyone who can see the chat, with names and photos for message bubbles.
export async function podChatMembers(podId: string): Promise<ChatMember[]> {
  const { data } = await createAdminClient()
    .from("pod_members")
    .select("role, status, user:users!pod_members_user_id_fkey(id, full_name, photo_url)")
    .eq("pod_id", podId)
    .in("status", READ_STATUSES);
  return (data ?? [])
    .map((m) => {
      const u = m.user as unknown as { id: string; full_name: string | null; photo_url: string | null } | null;
      return u ? { id: u.id, full_name: u.full_name ?? "UBC student", photo_url: u.photo_url, role: m.role, status: m.status } : null;
    })
    .filter((m): m is ChatMember => !!m);
}
