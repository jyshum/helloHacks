import { NextResponse } from "next/server";
import { getProfile } from "@/lib/profile";
import { isLatLng, jsonError } from "@/lib/api";
import { quoteRide } from "@/lib/quote";

// Preview the best match + gas contribution before the rider commits.
export async function POST(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const { pickup, ride_id } = await req.json();
  if (!isLatLng(pickup)) return jsonError("Pickup is required.", 400);
  const quote = await quoteRide(pickup, ride_id ?? null, me.id);
  if (!quote) return jsonError("No drivers heading that way right now.", 404);
  return NextResponse.json({ quote });
}
