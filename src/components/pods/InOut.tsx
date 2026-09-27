"use client";

import { Check } from "lucide-react";

// Two-way choice for one day's ride: "I'm in" or "Don't need a ride".
export default function InOut({ isIn, busy, onChange }: { isIn: boolean; busy: boolean; onChange: (next: boolean) => void }) {
  const opt = (on: boolean, label: React.ReactNode, next: boolean) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!on) onChange(next);
      }}
      disabled={busy}
      aria-pressed={on}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
        on ? (next ? "bg-ubc text-white shadow-glow" : "bg-ink/70 text-white") : "bg-ink/[0.04] text-muted"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="mt-3 flex gap-2">
      {opt(isIn, <>{isIn && <Check size={15} aria-hidden />} I&apos;m in</>, true)}
      {opt(!isIn, "Don't need a ride", false)}
    </div>
  );
}
