import { createAdminClient } from "@/lib/supabase/server";
import { driverShareOf } from "@/lib/pricing";

// Demo wallet. All money here is fake, but it moves exactly like the real thing would:
// every ride charges the rider and pays the driver, once, from a ledger.
export const WELCOME_CENTS = 2000;
export const DEMO_CARD = "Visa •••• 4242";

export type WalletEntry = {
  id: string;
  amount_cents: number;
  kind: "welcome" | "topup" | "ride" | "earning" | "cashout";
  label: string | null;
  created_at: string;
  other: { id: string; full_name: string; photo_url: string | null } | null;
};

// Balance + history. New wallets start with a little demo money.
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
    await admin.from("wallet_entries").insert({ user_id: userId, amount_cents: WELCOME_CENTS, kind: "welcome", label: "Welcome credit" });
    ({ data } = await read());
  }
  const entries = (data ?? []) as unknown as WalletEntry[];
  return { balance: entries.reduce((s, e) => s + e.amount_cents, 0), entries };
}

export async function balanceOf(userId: string): Promise<number> {
  const { data } = await createAdminClient().from("wallet_entries").select("amount_cents").eq("user_id", userId);
  return (data ?? []).reduce((s, e) => s + e.amount_cents, 0);
}

// Rider pays the full price; the driver gets the driver fee + gas (company fee and tax stay with hoppedIn).
// Safe to call more than once: the ledger's unique index (request_id, kind) means a ride is only charged once.
export async function settleRequest(requestId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: rr } = await admin
    .from("ride_requests")
    .select("id, rider_id, estimated_cost_cents, dropoff_label, ride:rides(driver_id)")
    .eq("id", requestId)
    .maybeSingle();
  const driverId = (rr?.ride as unknown as { driver_id: string } | null)?.driver_id;
  const cents = rr?.estimated_cost_cents ?? 0;
  if (!rr || !driverId || cents <= 0) return;
  const { data: done } = await admin.from("wallet_entries").select("id").eq("request_id", requestId).limit(1);
  if (done?.length) return;
  await admin.from("wallet_entries").insert([
    { user_id: rr.rider_id, amount_cents: -cents, kind: "ride", request_id: requestId, other_user_id: driverId, label: `Ride to ${rr.dropoff_label ?? "campus"}` },
    { user_id: driverId, amount_cents: driverShareOf(cents), kind: "earning", request_id: requestId, other_user_id: rr.rider_id, label: "Driver fee + gas" },
  ]);
}
