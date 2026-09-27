import { NextResponse } from "next/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { addEntry, balanceOf, DEMO_BANK } from "@/lib/wallet";

export const dynamic = "force-dynamic";

// Demo cash-out: moves the whole balance "to your bank". Keyed like top-ups, so it runs once.
export async function POST(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const { key } = await req.json().catch(() => ({}));
  if (typeof key !== "string" || key.length < 8) return jsonError("Missing payment key.", 400);
  const balance = await balanceOf(me.id);
  if (balance <= 0) return jsonError("Nothing to cash out.", 400);
  const { duplicate } = await addEntry({ user_id: me.id, amount_cents: -balance, kind: "cashout", label: `Sent to ${DEMO_BANK}`, idem_key: `cashout:${me.id}:${key}` });
  return NextResponse.json({ ok: true, cents: balance, duplicate });
}
