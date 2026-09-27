import { requireProfile } from "@/lib/profile";
import PeopleSearch from "@/components/people/PeopleSearch";

export const dynamic = "force-dynamic";

export default async function PeoplePage({ searchParams }: { searchParams: { role?: string } }) {
  await requireProfile();
  const role = searchParams.role === "driver" || searchParams.role === "rider" ? searchParams.role : "all";
  return <PeopleSearch initialRole={role} />;
}
