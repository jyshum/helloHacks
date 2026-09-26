import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/profile";
import BackButton from "@/components/app/BackButton";
import { formatCents } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Requested", cls: "bg-frost text-blue" },
  accepted: { label: "Confirmed", cls: "bg-green/10 text-green" },
  completed: { label: "Completed", cls: "bg-paper text-muted" },
  declined: { label: "Declined", cls: "bg-red-50 text-red-700" },
  cancelled: { label: "Cancelled", cls: "bg-red-50 text-red-700" },
};

export default async function TripsPage() {
  const me = await requireProfile();
  const admin = createAdminClient();
  const { data: myRides } = await admin.from("rides").select("id").eq("driver_id", me.id);
  const rideIds = (myRides ?? []).map((r) => r.id);

  const sel = "id, status, pickup_label, dropoff_label, estimated_cost_cents, created_at, rider_id, ride:rides(driver:users!rides_driver_id_fkey(full_name)), rider:users!ride_requests_rider_id_fkey(full_name)";
  const [{ data: asRider }, { data: asDriver }] = await Promise.all([
    admin.from("ride_requests").select(sel).eq("rider_id", me.id).order("created_at", { ascending: false }).limit(30),
    rideIds.length
      ? admin.from("ride_requests").select(sel).in("ride_id", rideIds).order("created_at", { ascending: false }).limit(30)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const trips = [
    ...(asRider ?? []).map((t) => ({ ...t, as: "rider" as const })),
    ...(asDriver ?? []).map((t) => ({ ...t, as: "driver" as const })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <main className="screen">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="font-heading text-2xl font-bold text-ink">Your trips</h1>
      </div>
      {!trips.length && <p className="mt-10 text-center text-muted">No trips yet. Your rides will show up here.</p>}
      <div className="mt-5 flex flex-col gap-3">
        {trips.map((t) => {
          const ride = t.ride as unknown as { driver: { full_name: string } | null } | null;
          const rider = t.rider as unknown as { full_name: string } | null;
          const other = t.as === "rider" ? ride?.driver?.full_name : rider?.full_name;
          const s = STATUS[t.status] ?? STATUS.pending;
          return (
            <Link key={`${t.as}-${t.id}`} href={`/match/${t.id}`} className="card flex items-center gap-4 p-4">
              <span className="row-icon">{t.as === "rider" ? "🧍" : "🚗"}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-heading font-semibold text-ink">{t.dropoff_label}</p>
                <p className="truncate text-sm text-muted">
                  {t.as === "rider" ? "with" : "picked up"} {other ?? "–"} · {new Date(t.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-ink">{t.estimated_cost_cents != null ? formatCents(t.estimated_cost_cents) : ""}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
