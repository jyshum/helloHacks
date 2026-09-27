import { NextResponse } from "next/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { addEntry, DEMO_CARD } from "@/lib/wallet";

export const dynamic = "force-dynamic";

const AMOUNTS = [1000, 2000, 5000];

// Demo top-up: no card is charged, the money just appears.
// `key` is made once per payment sheet, so a double tap or retry can't add money twice.
export async function POST(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const { cents, key } = await req.json().catch(() => ({}));
  if (!AMOUNTS.includes(cents)) return jsonError("Pick an amount.", 400);
  if (typeof key !== "string" || key.length < 8) return jsonError("Missing payment key.", 400);
  const { duplicate } = await addEntry({ user_id: me.id, amount_cents: cents, kind: "topup", label: `Added from ${DEMO_CARD}`, idem_key: `topup:${me.id}:${key}` });
  return NextResponse.json({ ok: true, cents, duplicate });
}
