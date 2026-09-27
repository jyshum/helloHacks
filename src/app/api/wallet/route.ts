import { NextResponse } from "next/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { loadWallet } from "@/lib/wallet";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  return NextResponse.json(await loadWallet(me.id));
}
