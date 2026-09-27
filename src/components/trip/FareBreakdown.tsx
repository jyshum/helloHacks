import { formatCents, type Fare } from "@/lib/pricing";

export default function FareBreakdown({ fare }: { fare: Fare }) {
  return (
    <div className="rounded-2xl bg-frost p-4 text-sm">
      <Row label="Driver fee" value={formatCents(fare.driver)} />
      <Row label="Company fee" value={formatCents(fare.company)} />
      <Row label={`Gas · ${fare.km} km × 15¢`} value={formatCents(fare.gas)} />
      <Row label="Tax 5%" value={formatCents(fare.tax)} />
      <div className="my-2 border-t border-line" />
      <Row label="Total" value={formatCents(fare.total)} bold />
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${bold ? "font-semibold text-ink" : "text-muted"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
