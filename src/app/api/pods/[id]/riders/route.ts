import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { addRider, dayStates, riderOptions, type DayState } from "@/lib/pods/match";
import { fareBetween } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export type RiderCard = {
  id: string;
  full_name: string;
  photo_url: string | null;
  faculty: string | null;
  year: number | null;
  area: string | null;
  week: DayState[];
  pickupTime: string;
  pickupLabel: string;
  detourMinutes: number;
  earnCents: number; // what the driver gets per ride (driver fee + gas)
};

async function asDriver(podId: string) {
  const me = await getProfile();
  if (!me) return { error: jsonError("Sign in first.", 401) };
  const { data: pod } = await createAdminClient().from("pods").select("driver_id, campus_lat, campus_lng").eq("id", podId).maybeSingle();
  if (!pod || pod.driver_id !== me.id) return { error: jsonError("Only the driver can do that.", 403) };
  return { me, pod };
}

// "Riders for you": commuters who fit the driver's route and schedule.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const a = await asDriver(params.id);
  if ("error" in a) return a.error;
  const options = await riderOptions(a.me.id);
  if (!options.length) return NextResponse.json({ riders: [] });
  const admin = createAdminClient();
  const [{ data: users }, { data: dp }] = await Promise.all([
    admin.from("users").select("id, full_name, photo_url, faculty, year").in("id", options.map((o) => o.rider.user_id)),
    admin.from("commute_profiles").select("days, arrive_by, day_times").eq("user_id", a.me.id).single(),
  ]);
  const campus = { lat: a.pod.campus_lat, lng: a.pod.campus_lng };
  const riders: RiderCard[] = options.map(({ rider, fit, covered }) => {
    const u = users!.find((x) => x.id === rider.user_id)!;
    return {
      ...u,
      area: rider.home_area,
      week: dp ? dayStates({ ...dp, day_times: dp.day_times ?? {} }, rider, fit.days, covered) : [],
      pickupTime: fit.pickupTime,
      pickupLabel: fit.pickupLabel,
      detourMinutes: fit.detourMinutes,
      earnCents: (({ driver, gas }) => driver + gas)(fareBetween(fit.pickup, campus)),
    };
  });
  return NextResponse.json({ riders });
}

// Driver taps Add on a rider.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await asDriver(params.id);
  if ("error" in a) return a.error;
  const { riderId } = await req.json().catch(() => ({}));
  if (!riderId) return jsonError("Pick a rider.", 400);
  const res = await addRider(a.me.id, riderId);
  if ("error" in res) return jsonError(res.error, 409);
  return NextResponse.json(res);
}
