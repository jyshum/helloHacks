type P = { faculty: string | null; year: number | null };

export function sharedContext(a: P, b: P): string | null {
  if (a.faculty && b.faculty && a.faculty === b.faculty) return `Both in ${a.faculty}`;
  if (a.year && b.year && a.year === b.year) return `Both year ${a.year}`;
  return null;
}

export default function SharedBadge({ a, b }: { a: P; b: P }) {
  const text = sharedContext(a, b);
  if (!text) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2.5 py-1 text-xs font-semibold text-green">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      {text}
    </span>
  );
}
