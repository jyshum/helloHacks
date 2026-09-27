import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { podMembership } from "@/components/pods/chat/membership";
import PodChat from "@/components/pods/chat/PodChat";

export const dynamic = "force-dynamic";

export default async function PodChatPage({ params }: { params: { id: string } }) {
  const me = await requireProfile();
  if (!(await podMembership(params.id, me.id))) notFound();
  return <PodChat podId={params.id} me={{ id: me.id, full_name: me.full_name ?? "You", photo_url: me.photo_url }} />;
}
