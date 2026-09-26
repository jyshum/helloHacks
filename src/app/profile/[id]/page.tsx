import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/profile";
import Avatar from "@/components/Avatar";
import BackButton from "@/components/app/BackButton";
import SignOutButton from "@/components/app/SignOutButton";
import SharedBadge from "@/components/SharedBadge";
import type { User, Vehicle } from "@/lib/types";

export const dynamic = "force-dynamic";

const CHAT: Record<string, string> = { chatty: "Likes to chat", quiet: "Prefers quiet rides", no_preference: "Easygoing" };

export default async function ProfilePage({ params }: { params: { id: string } }) {
  const me = await requireProfile();
  const isMe = params.id === "me" || params.id === me.id;
  const id = isMe ? me.id : params.id;
  const admin = createAdminClient();

  const { data: user } = await admin.from("users").select("*").eq("id", id).maybeSingle();
  if (!user) notFound();
  const u = user as User & { created_at: string };

  const [{ data: vehicle }, { data: reviews }, { count: riderTrips }, { data: driverRides }] = await Promise.all([
    admin.from("vehicles").select("*").eq("user_id", id).maybeSingle(),
    admin
      .from("ratings")
      .select("id, score, comment, created_at, rater:users!ratings_rater_id_fkey(id, full_name, photo_url)")
      .eq("ratee_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    admin.from("ride_requests").select("id", { count: "exact", head: true }).eq("rider_id", id).eq("status", "completed"),
    admin.from("rides").select("id").eq("driver_id", id),
  ]);
  const { count: driverTrips } = driverRides?.length
    ? await admin
        .from("ride_requests")
        .select("id", { count: "exact", head: true })
        .in("ride_id", driverRides.map((r) => r.id))
        .eq("status", "completed")
    : { count: 0 };
  const trips = (riderTrips ?? 0) + (driverTrips ?? 0);
  const drives = u.role === "driver" || u.role === "both";
  const v = vehicle as Vehicle | null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-app bg-paper pb-10">
      <div className="relative bg-ubc px-5 pb-16 pt-4 text-white">
        <BackButton className="text-ink" />
        <div className="mt-4 flex flex-col items-center text-center">
          <Avatar name={u.full_name} photoUrl={u.photo_url} size={96} tone={drives ? "driver" : "rider"} />
          <h1 className="mt-3 font-heading text-3xl font-bold">{u.full_name}</h1>
          <p className="text-white/75">{[u.faculty, u.year && `Year ${u.year}`].filter(Boolean).join(" · ") || "UBC student"}</p>
          {u.license_verified && (
            <span className="mt-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">License verified ✓</span>
          )}
        </div>
      </div>

      <div className="relative z-10 -mt-10 px-5">
        <div className="card grid grid-cols-3 divide-x divide-line py-4 text-center">
          <Stat value={`★ ${Number(u.rating_avg ?? 5).toFixed(1)}`} label={`${u.rating_count ?? 0} ratings`} />
          <Stat value={String(trips)} label="trips" />
          <Stat value={new Date(u.created_at).toLocaleDateString([], { month: "short", year: "numeric" })} label="joined" />
        </div>

        {!isMe && (
          <div className="mt-3 flex justify-center">
            <SharedBadge a={me} b={u} />
          </div>
        )}

        <div className="card mt-4 divide-y divide-line px-5">
          <InfoRow icon="🎓" label="UBC verified" value={isMe ? u.ubc_email : "UBC email confirmed"} />
          <InfoRow icon="💬" label="Ride vibe" value={CHAT[u.chat_preference] ?? "Easygoing"} />
          <InfoRow icon={drives ? "🚗" : "🧍"} label="Rides as" value={u.role === "both" ? "Driver & rider" : u.role === "driver" ? "Driver" : "Rider"} />
        </div>

        {drives && (
          <div className="card mt-4 p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted">Car</p>
            {v ? (
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <p className="font-heading text-lg font-semibold">{v.color} {v.make_model}</p>
                  <p className="text-sm text-muted">{v.seat_capacity} seats{v.is_ev ? " · Electric ⚡" : ""}</p>
                </div>
                <span className="rounded-lg border-2 border-ubc px-2 py-1 font-mono text-sm font-bold tracking-wider text-ubc">{v.license_plate}</span>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">No car added yet.</p>
            )}
            {isMe && (
              <Link href="/driver-verify" className="mt-3 block text-sm font-semibold text-blue">
                {v && u.license_verified ? "Update license & car →" : "Verify license & add car →"}
              </Link>
            )}
          </div>
        )}

        <div className="mt-6">
          <h2 className="font-heading text-lg font-bold text-ink">What people say</h2>
          {!reviews?.length && <p className="mt-2 text-sm text-muted">No reviews yet.</p>}
          <div className="mt-2 flex flex-col gap-3">
            {reviews?.map((r) => {
              const rater = r.rater as unknown as { id: string; full_name: string; photo_url: string | null } | null;
              return (
                <div key={r.id} className="card p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={rater?.full_name} photoUrl={rater?.photo_url} size={36} tone="rider" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink">{rater?.full_name ?? "UBC student"}</p>
                      <p className="text-xs text-sky">{"★".repeat(r.score)}<span className="text-line">{"★".repeat(5 - r.score)}</span></p>
                    </div>
                    <span className="text-xs text-muted">{new Date(r.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                  </div>
                  {r.comment && <p className="mt-2 text-sm text-ink">&ldquo;{r.comment}&rdquo;</p>}
                </div>
              );
            })}
          </div>
        </div>

        {isMe && (
          <div className="mt-8">
            <SignOutButton />
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-heading text-lg font-bold text-ink">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 py-3">
      <span className="text-lg">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="truncate font-medium text-ink">{value}</p>
      </div>
    </div>
  );
}
