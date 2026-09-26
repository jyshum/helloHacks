import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { isLatLng, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getProfile())) return jsonError("Sign in first.", 401);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("rides")
    .select("*, driver:users!rides_driver_id_fkey(id, full_name, faculty, year, photo_url, rating_avg, license_verified)")
    .eq("status", "posted")
    .order("departure_time", { ascending: true });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ rides: data });
}

export async function POST(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  if (me.role === "rider") return jsonError("Only drivers can post routes.", 403);

  const body = await req.json();
  const { origin, destination, origin_label, destination_label, departure_time, seats_available } = body;
  if (!isLatLng(origin) || !isLatLng(destination)) return jsonError("Origin and destination are required.", 400);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("rides")
    .insert({
      driver_id: me.id,
      origin_lat: origin.lat,
      origin_lng: origin.lng,
      origin_label: origin_label ?? null,
      destination_lat: destination.lat,
      destination_lng: destination.lng,
      destination_label: destination_label ?? null,
      departure_time: departure_time ?? new Date().toISOString(),
      seats_available: Number(seats_available) || 3,
      status: "posted",
    })
    .select()
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ride: data }, { status: 201 });
}
