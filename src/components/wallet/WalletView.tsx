"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, CreditCard, Gift, Landmark, Plus } from "lucide-react";
import BackButton from "@/components/app/BackButton";
import Avatar from "@/components/Avatar";
import { formatCents } from "@/lib/pricing";
import type { WalletEntry } from "@/lib/wallet";

const AMOUNTS = [1000, 2000, 5000];
type Sheet = null | "add" | "cashout";

export default function WalletView({ initial }: { initial: { balance: number; entries: WalletEntry[] } }) {
  const [wallet, setWallet] = useState(initial);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [closing, setClosing] = useState(false);
  const [amount, setAmount] = useState(2000);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function open(s: Sheet) {
    setDone(null);
    setError(null);
    setClosing(false);
    setSheet(s);
  }
  function close() {
    setClosing(true);
    setTimeout(() => setSheet(null), 250);
  }

  async function refresh() {
    const res = await fetch("/api/wallet", { cache: "no-store" });
    if (res.ok) setWallet(await res.json());
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(sheet === "add" ? "/api/wallet/topup" : "/api/wallet/cashout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: sheet === "add" ? JSON.stringify({ cents: amount }) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Something went wrong.");
    setDone(sheet === "add" ? `${formatCents(amount)} added` : `${formatCents(body.cents)} sent`);
    await refresh();
    setTimeout(close, 900);
  }

  const negative = wallet.balance < 0;

  return (
    <main className="screen pb-16">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-bold tracking-tight text-ink">Wallet</h1>
      </div>

      {/* Balance */}
      <div className="rise mt-6 overflow-hidden rounded-card bg-gradient-to-br from-ubc via-[#003a78] to-blue p-6 text-white shadow-lift">
        <div className="flex items-center justify-between">
          <p className="text-sm text-white/70">Balance</p>
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/90">Demo money</span>
        </div>
        <p className={`mt-2 text-5xl font-bold tracking-tight ${negative ? "text-red-200" : ""}`}>{formatCents(wallet.balance)}</p>
        <p className="mt-1 text-sm text-white/70">{negative ? "Add money to keep riding" : "Rides pay automatically when you arrive"}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button onClick={() => open("add")} className="flex items-center justify-center gap-2 rounded-full bg-white py-3 font-semibold text-ubc transition active:scale-[0.97]">
            <Plus size={18} aria-hidden /> Add money
          </button>
          <button
            onClick={() => open("cashout")}
            disabled={wallet.balance <= 0}
            className="flex items-center justify-center gap-2 rounded-full bg-white/15 py-3 font-semibold text-white transition active:scale-[0.97] disabled:opacity-40"
          >
            <Landmark size={18} aria-hidden /> Cash out
          </button>
        </div>
      </div>

      {/* History */}
      <p className="mt-8 font-semibold text-ink">Activity</p>
      <div className="card mt-3 divide-y divide-ink/5 px-4">
        {wallet.entries.map((e) => (
          <Row key={e.id} e={e} />
        ))}
      </div>

      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col" onClick={close}>
          <div className={`absolute inset-0 bg-ink/25 ${closing ? "fade-out" : "fade-in"}`} aria-hidden />
          <div
            className={`relative mx-auto mt-auto w-full max-w-app rounded-t-[32px] border border-white/70 bg-[#f7f9fc] px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-3 shadow-lift ${closing ? "sheet-out" : "sheet-in"}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={sheet === "add" ? "Add money" : "Cash out"}
          >
            <div className="sheet-handle" />
            {done ? (
              <div className="flex flex-col items-center py-8">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green text-white">
                  <Check size={30} strokeWidth={2.5} aria-hidden />
                </div>
                <p className="mt-4 text-xl font-bold text-ink">{done}</p>
              </div>
            ) : sheet === "add" ? (
              <>
                <p className="text-xl font-bold text-ink">Add money</p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {AMOUNTS.map((a) => (
                    <button
                      key={a}
                      onClick={() => setAmount(a)}
                      className={`rounded-2xl py-4 text-lg font-bold transition ${amount === a ? "bg-ubc text-white shadow-glow" : "bg-white text-ink shadow-soft"}`}
                      aria-pressed={amount === a}
                    >
                      ${a / 100}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-soft">
                  <CreditCard size={20} className="text-muted" aria-hidden />
                  <span className="flex-1 font-medium text-ink">Visa •••• 4242</span>
                  <span className="text-xs font-semibold text-muted">Demo card</span>
                </div>
                {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
                <button onClick={submit} disabled={busy} className="btn-ubc mt-5 w-full py-4 text-lg">
                  {busy ? "Adding…" : `Add ${formatCents(amount)}`}
                </button>
              </>
            ) : (
              <>
                <p className="text-xl font-bold text-ink">Cash out</p>
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-soft">
                  <Landmark size={20} className="text-muted" aria-hidden />
                  <span className="flex-1 font-medium text-ink">Bank •••• 6789</span>
                  <span className="text-xs font-semibold text-muted">Demo bank</span>
                </div>
                {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
                <button onClick={submit} disabled={busy} className="btn-ubc mt-5 w-full py-4 text-lg">
                  {busy ? "Sending…" : `Send ${formatCents(Math.max(0, wallet.balance))}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function Row({ e }: { e: WalletEntry }) {
  const inbound = e.amount_cents > 0;
  const when = new Date(e.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  const title = e.kind === "ride" && e.other ? `Ride with ${e.other.full_name.split(" ")[0]}` : e.kind === "earning" && e.other ? `${e.other.full_name.split(" ")[0]} paid you` : e.label ?? "";
  const Icon = e.kind === "welcome" ? Gift : e.kind === "topup" ? ArrowDownLeft : e.kind === "cashout" ? Landmark : ArrowUpRight;
  return (
    <div className="flex items-center gap-3 py-3.5">
      {e.other ? (
        <Avatar name={e.other.full_name} photoUrl={e.other.photo_url} size={40} />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-frost text-blue">
          <Icon size={18} aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">{title}</p>
        <p className="truncate text-[13px] text-muted">
          {when}
          {e.kind === "ride" || e.kind === "earning" ? ` · ${e.label}` : ""}
        </p>
      </div>
      <p className={`font-semibold ${inbound ? "text-green" : "text-ink"}`}>
        {inbound ? "+" : "−"}
        {formatCents(Math.abs(e.amount_cents))}
      </p>
    </div>
  );
}
