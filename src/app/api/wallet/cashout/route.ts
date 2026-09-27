import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { balanceOf } from "@/lib/wallet";

export const dynamic = "force-dynamic";

// Demo cash-out: moves the whole balance "to your bank".
export async function POST() {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const balance = await balanceOf(me.id);
  if (balance <= 0) return jsonError("Nothing to cash out.", 400);
  const { error } = await createAdminClient()
    .from("wallet_entries")
    .insert({ user_id: me.id, amount_cents: -balance, kind: "cashout", label: "Sent to bank •••• 6789" });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true, cents: balance });
}
