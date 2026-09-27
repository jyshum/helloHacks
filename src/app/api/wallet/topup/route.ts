import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { DEMO_CARD } from "@/lib/wallet";

export const dynamic = "force-dynamic";

const AMOUNTS = [1000, 2000, 5000];

// Demo top-up: no card is charged, the money just appears.
export async function POST(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const { cents } = await req.json().catch(() => ({}));
  if (!AMOUNTS.includes(cents)) return jsonError("Pick an amount.", 400);
  const { error } = await createAdminClient()
    .from("wallet_entries")
    .insert({ user_id: me.id, amount_cents: cents, kind: "topup", label: `Added from ${DEMO_CARD}` });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
