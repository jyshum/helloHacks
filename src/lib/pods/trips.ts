import { createAdminClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { postSystemMessage } from "@/lib/pods/chat";
import { dayWord, prettyTime } from "@/lib/pods/time";

type Admin = ReturnType<typeof createAdminClient>;

export async function getOrCreateTrip(admin: Admin, podId: string, date: string) {
  const { data: existing } = await admin.from("pod_trips").select("*").eq("pod_id", podId).eq("trip_date", date).maybeSingle();
  if (existing) return existing;
  const { data } = await admin.from("pod_trips").insert({ pod_id: podId, trip_date: date, status: "scheduled" }).select("*").single();
  return data!;
}

async function riderIds(admin: Admin, podId: string, date?: string): Promise<string[]> {
  const { data } = await admin.from("pod_members").select("user_id").eq("pod_id", podId).eq("role", "rider").eq("status", "active");
  let ids = (data ?? []).map((m) => m.user_id);
  if (date) {
    const { data: skips } = await admin.from("pod_skips").select("user_id").eq("pod_id", podId).eq("trip_date", date);
    const skipped = new Set((skips ?? []).map((s) => s.user_id));
    ids = ids.filter((id) => !skipped.has(id));
  }
  return ids;
}

// Driver: "Yes, driving" for a date.
export async function confirmTrip(podId: string, date: string, driverName: string, leaveAt: string | null) {
  const admin = createAdminClient();
  const trip = await getOrCreateTrip(admin, podId, date);
  if (trip.status === "live" || trip.status === "completed") return trip;
  await admin.from("pod_trips").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", trip.id);
  const when = dayWord(date);
  await postSystemMessage(podId, `✅ ${driverName} confirmed ${when}${leaveAt ? `, first pickup ${prettyTime(leaveAt)}` : ""}.`);
  await notify(await riderIds(admin, podId, date), {
    kind: "trip_confirmed",
    title: `${driverName} is driving ${when}`,
    body: leaveAt ? `Be at your pickup spot by your time. First pickup ${prettyTime(leaveAt)}.` : "See your pickup time in the app.",
    url: `/pods/${podId}`,
  });
  return trip;
}

// Driver: "Can't drive" for a date.
export async function cancelTrip(podId: string, date: string, driverName: string) {
  const admin = createAdminClient();
  const trip = await getOrCreateTrip(admin, podId, date);
  await admin.from("pod_trips").update({ status: "cancelled" }).eq("id", trip.id);
  if (trip.ride_id) await admin.from("rides").update({ status: "cancelled" }).eq("id", trip.ride_id);
  const when = dayWord(date);
  await postSystemMessage(podId, `❌ ${driverName} can't drive ${when}.`);
  await notify(await riderIds(admin, podId, date), {
    kind: "trip_cancelled",
    title: `No pod ride ${when}`,
    body: `${driverName} can't drive ${when}. Open the app to find another ride.`,
    url: `/pods/${podId}`,
  });
}

// Driver: "Start pickup". Creates a normal ride + one accepted request per rider so the
// existing live trip screen (/match), tracking, Start/End and ratings all just work.
export async function startTrip(podId: string, date: string) {
  const admin = createAdminClient();
  const trip = await getOrCreateTrip(admin, podId, date);
  if (trip.ride_id && trip.status === "live") return trip;

  const { data: pod } = await admin.from("pods").select("*").eq("id", podId).single();
  const { data: dp } = await admin.from("commute_profiles").select("*").eq("user_id", pod!.driver_id).single();
  const { data: driver } = await admin.from("users").select("full_name").eq("id", pod!.driver_id).single();
  const ids = await riderIds(admin, podId, date);
  const { data: members } = ids.length
    ? await admin.from("pod_members").select("*").eq("pod_id", podId).in("user_id", ids)
    : { data: [] };

  const { data: ride } = await admin
    .from("rides")
    .insert({
      driver_id: pod!.driver_id,
      origin_lat: dp!.home_lat,
      origin_lng: dp!.home_lng,
      origin_label: dp!.home_area ?? "Home",
      destination_lat: pod!.campus_lat,
      destination_lng: pod!.campus_lng,
      destination_label: pod!.campus_label,
      departure_time: new Date().toISOString(),
      seats_available: 0, // pod rides aren't open to on-demand riders
      status: "posted",
    })
    .select("*")
    .single();

  if (members?.length) {
    await admin.from("ride_requests").insert(
      members.map((m) => ({
        ride_id: ride!.id,
        rider_id: m.user_id,
        pickup_lat: m.pickup_lat ?? dp!.home_lat,
        pickup_lng: m.pickup_lng ?? dp!.home_lng,
        pickup_label: m.pickup_label ?? "Pickup",
        dropoff_lat: pod!.campus_lat,
        dropoff_lng: pod!.campus_lng,
        dropoff_label: pod!.campus_label,
        detour_minutes: m.detour_minutes,
        detour_km: null,
        estimated_cost_cents: null,
        status: "accepted",
      }))
    );
  }
  await admin.from("pod_trips").update({ status: "live", ride_id: ride!.id }).eq("id", trip.id);
  await postSystemMessage(podId, `🚗 ${driver!.full_name.split(" ")[0]} is on the way. Track the car live from the pod screen.`);
  await notify(ids, {
    kind: "trip_confirmed",
    title: `${driver!.full_name.split(" ")[0]} is on the way`,
    body: "Head to your pickup spot. Tap to track the car live.",
    url: `/pods/${podId}`,
  });
  return trip;
}
