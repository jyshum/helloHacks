import { Star } from "lucide-react";

export default function Stars({ value, count }: { value: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted">
      <Star size={14} className="text-sky" fill="currentColor" strokeWidth={0} aria-hidden />
      <span className="font-semibold text-ink">{Number(value ?? 5).toFixed(1)}</span>
      {count !== undefined && <span>({count})</span>}
    </span>
  );
}
