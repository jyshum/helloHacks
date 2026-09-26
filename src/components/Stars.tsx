export default function Stars({ value, count }: { value: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted">
      <span className="text-sky">★</span>
      <span className="font-semibold text-ink">{Number(value ?? 5).toFixed(1)}</span>
      {count !== undefined && <span>({count})</span>}
    </span>
  );
}
