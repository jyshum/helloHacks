import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { loadPodView } from "@/lib/pods/load";
import { menuUserFor } from "@/lib/menu";
import PodScreen from "@/components/pods/PodScreen";

export const dynamic = "force-dynamic";

export default async function PodPage({ params }: { params: { id: string } }) {
  const me = await requireProfile();
  const view = await loadPodView(params.id, me.id);
  if (!view) notFound();
  // Not part of this pod (or no longer): go back to the pods home.
  if (!view.me || ["declined", "left"].includes(view.me.status) || view.pod.status !== "active") redirect("/pods");
  return <PodScreen view={view} me={menuUserFor(me)} meFaculty={me.faculty} meYear={me.year} />;
}
