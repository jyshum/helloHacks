import { NextResponse } from "next/server";
import { getProfile } from "@/lib/profile";
import { isLatLng, jsonError } from "@/lib/api";
import { quoteRides } from "@/lib/quote";

// Every driver the rider could pick for this pickup ("Choose a ride").
export async function POST(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const { pickup } = await req.json();
  if (!isLatLng(pickup)) return jsonError("Pickup is required.", 400);
  const options = await quoteRides(pickup, { excludeDriverId: me.id, limit: 8 });
  return NextResponse.json({ options });
}
