import { NextResponse } from "next/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";

// Proxies Places API (New) autocomplete, limited to Metro Vancouver.
// Returns { unavailable: true } if the API isn't enabled so the UI can fall back.
export async function POST(req: Request) {
  if (!(await getProfile())) return jsonError("Sign in first.", 401);
  const { input } = await req.json();
  if (!input || String(input).trim().length < 2) return NextResponse.json({ suggestions: [] });

  const key = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({
      input,
      includedRegionCodes: ["ca"],
      // Metro Vancouver only (Squamish-ish down to the border, UBC east to Langley).
      locationRestriction: { rectangle: { low: { latitude: 48.99, longitude: -123.3 }, high: { latitude: 49.45, longitude: -122.45 } } },
    }),
  });
  const body = await res.json();
  if (!res.ok) return NextResponse.json({ unavailable: true, suggestions: [] });

  type S = { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } };
  const suggestions = ((body.suggestions ?? []) as S[])
    .filter((s) => s.placePrediction)
    .map((s) => ({
      placeId: s.placePrediction!.placeId,
      main: s.placePrediction!.structuredFormat?.mainText?.text ?? "",
      secondary: s.placePrediction!.structuredFormat?.secondaryText?.text ?? "",
    }));
  return NextResponse.json({ suggestions });
}
