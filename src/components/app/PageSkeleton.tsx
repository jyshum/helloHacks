// Shown the instant you tap, while the next screen loads. Keeps taps from feeling frozen.
export default function PageSkeleton() {
  return (
    <main className="screen" aria-busy="true" aria-label="Loading">
      <div className="flex items-center justify-between">
        <div className="h-11 w-11 animate-pulse rounded-full bg-ink/[0.06]" />
        <div className="h-11 w-11 animate-pulse rounded-full bg-ink/[0.06]" />
      </div>
      <div className="mt-8 h-8 w-44 animate-pulse rounded-full bg-ink/[0.07]" />
      <div className="mt-3 h-4 w-56 animate-pulse rounded-full bg-ink/[0.05]" />
      <div className="mt-6 flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-36 animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    </main>
  );
}
