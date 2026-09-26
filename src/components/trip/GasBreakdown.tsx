import { BASE_CENTS, CAP_CENTS, PER_KM_CENTS, formatCents } from "@/lib/pricing";

export default function GasBreakdown({ detourKm, totalCents }: { detourKm: number; totalCents: number }) {
  const perKm = Math.round(detourKm * PER_KM_CENTS);
  return (
    <div className="rounded-2xl bg-frost p-4 text-sm">
      <p className="mb-2 font-heading font-semibold text-ubc">Gas contribution</p>
      <Row label="Base" value={formatCents(BASE_CENTS)} />
      <Row label={`Detour ${detourKm} km × ${formatCents(PER_KM_CENTS)}`} value={formatCents(perKm)} />
      <div className="my-2 border-t border-line" />
      <Row label="Total (rounded to 5¢)" value={formatCents(totalCents)} bold />
      <p className="mt-2 text-xs text-muted">
        Capped at {formatCents(CAP_CENTS)}. Cost-sharing only. Drivers don&apos;t profit.
      </p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-ink" : "text-muted"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
