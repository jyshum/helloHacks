import { createAdminClient } from "@/lib/supabase/server";
import { driverShareOf, formatCents } from "@/lib/pricing";
import { postSystemMessage } from "@/lib/pods/chat";
import { notify } from "@/lib/notify";
import { DEMO_BANK, DEMO_CARD } from "@/lib/demoMoney";

export { DEMO_BANK, DEMO_CARD };

// Demo wallet. All money here is fake, but it moves exactly like the real thing would:
// every pod ride charges the rider and pays the driver, once, from a ledger.
export const WELCOME_CENTS = 2000;
export const TOPUP_STEP_CENTS = 2000; // auto top-ups come in $20 steps

export type WalletEntry = {
  id: string;
  amount_cents: number;
  kind: "welcome" | "topup" | "ride" | "earning" | "cashout";
  label: string | null;
  created_at: string;
  other: { id: string; full_name: string; photo_url: string | null } | null;
};

const UNIQUE_VIOLATION = "23505";

// Adds one wallet row guarded by a one-time key. A repeat of the same key (double tap, retry)
// is rejected by the database's unique index and treated as "already done".
export async function addEntry(row: { user_id: string; amount_cents: number; kind: WalletEntry["kind"]; label: string; idem_key: string }) {
  const { error } = await createAdminClient().from("wallet_entries").insert(row);
  if (error && error.code !== UNIQUE_VIOLATION) throw new Error(error.message);
  return { duplicate: !!error };
}

// Balance + history. New wallets start with a little demo money (once, keyed per user).
export async function loadWallet(userId: string): Promise<{ balance: number; entries: WalletEntry[] }> {
  const admin = createAdminClient();
  const read = () =>
    admin
      .from("wallet_entries")
      .select("id, amount_cents, kind, label, created_at, other:users!wallet_entries_other_user_id_fkey(id, full_name, photo_url)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
  let { data } = await read();
  if (!data?.length) {
    await addEntry({ user_id: userId, amount_cents: WELCOME_CENTS, kind: "welcome", label: "Welcome credit", idem_key: `welcome:${userId}` });
    ({ data } = await read());
  }
  const entries = (data ?? []) as unknown as WalletEntry[];
  return { balance: entries.reduce((s, e) => s + e.amount_cents, 0), entries };
}

export async function balanceOf(userId: string): Promise<number> {
  const { data } = await createAdminClient().from("wallet_entries").select("amount_cents").eq("user_id", userId);
  return (data ?? []).reduce((s, e) => s + e.amount_cents, 0);
}

// Pays for one ride when it ends. Pod rides only for now (on-demand rides are deferred).
// The money moves inside the database (settle_ride): locked, all-or-nothing, charged at most once.
export async function settleRequest(requestId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: rr } = await admin
    .from("ride_requests")
    .select("ride_id, estimated_cost_cents, rider:users!ride_requests_rider_id_fkey(full_name), ride:rides(driver_id, driver:users!rides_driver_id_fkey(full_name))")
    .eq("id", requestId)
    .maybeSingle();
  const cents = rr?.estimated_cost_cents ?? 0;
  if (!rr || cents <= 0) return;
  const { data: trip } = await admin.from("pod_trips").select("pod_id").eq("ride_id", rr.ride_id).maybeSingle();
  if (!trip) return;

  const { data, error } = await admin.rpc("settle_ride", {
    p_request: requestId,
    p_driver_share: driverShareOf(cents),
    p_topup_step: TOPUP_STEP_CENTS,
    p_card: DEMO_CARD,
  });
  if (error) return console.error("[wallet] settle failed:", error.message);
  const result = (data as { charged: boolean }[] | null)?.[0];
  if (!result?.charged) return; // already paid

  // Receipt: a line in the pod chat, and a nudge to the driver.
  const ride = rr.ride as unknown as { driver_id: string; driver: { full_name: string } | null };
  const riderFirst = ((rr.rider as unknown as { full_name: string } | null)?.full_name ?? "A rider").split(" ")[0];
  const driverFirst = (ride.driver?.full_name ?? "the driver").split(" ")[0];
  await postSystemMessage(trip.pod_id, `${riderFirst} paid ${driverFirst} ${formatCents(cents)} for today's ride.`);
  await notify([ride.driver_id], {
    kind: "ride_paid",
    title: `${riderFirst} paid you ${formatCents(driverShareOf(cents))}`,
    body: "Driver fee + gas, in your wallet now.",
    url: "/wallet",
  });
}
