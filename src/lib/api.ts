import { NextResponse } from "next/server";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function isLatLng(v: unknown): v is { lat: number; lng: number } {
  const p = v as { lat?: unknown; lng?: unknown };
  return !!p && typeof p.lat === "number" && typeof p.lng === "number";
}
