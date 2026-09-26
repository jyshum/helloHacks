import { NextResponse } from "next/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";

// Resolves a Places placeId to coordinates + a label.
export async function GET(req: Request) {
  if (!(await getProfile())) return jsonError("Sign in first.", 401);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("Missing id.", 400);

  const key = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "location,displayName,formattedAddress" },
  });
  const body = await res.json();
  if (!res.ok || !body.location) return jsonError("Couldn't find that place.", 502);
  return NextResponse.json({
    label: body.displayName?.text ?? body.formattedAddress ?? "Selected place",
    lat: body.location.latitude,
    lng: body.location.longitude,
  });
}
