import Link from "next/link";
import { ArrowRight, BadgeCheck, Car, ShieldCheck, Timer, Users } from "lucide-react";

export default function Landing() {
  return (
    <main className="screen flex min-h-[100dvh] flex-col">
      <nav className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-lg font-bold tracking-tight text-ubc">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-ubc text-white shadow-glow">
            <Car size={16} aria-hidden />
          </span>
          hoppedIn
        </span>
        <Link href="/login" className="glass rounded-full px-4 py-2 text-sm font-semibold text-ubc">
          Log in
        </Link>
      </nav>

      <header className="rise mt-14">
        <h1 className="text-[44px] font-bold leading-[1.02] text-ubc">
          Ride to UBC
          <br />
          <span className="text-blue">together.</span>
        </h1>
        <p className="mt-4 text-lg text-muted">Same route. Same people. Every week.</p>
      </header>

      <PodPreview />

      <div className="mt-6 flex justify-center gap-1.5">
        <Chip icon={<ShieldCheck size={14} aria-hidden />} label="UBC only" />
        <Chip icon={<Users size={14} aria-hidden />} label="Weekly pods" />
        <Chip icon={<Timer size={14} aria-hidden />} label="Save time" />
      </div>

      <div className="mt-auto pt-10">
        <Link href="/signup" className="group btn-ubc w-full py-4 text-lg">
          Get started <ArrowRight size={20} className="transition group-hover:translate-x-1" aria-hidden />
        </Link>
        <p className="mt-4 text-center text-xs text-muted/80">Not affiliated with UBC</p>
      </div>
    </main>
  );
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="glass flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-medium text-ink">
      <span className="text-blue">{icon}</span>
      {label}
    </span>
  );
}

// A floating glass card showing what a pod looks like.
function PodPreview() {
  const people = [
    { i: "MP", c: "bg-ubc" },
    { i: "SK", c: "bg-sky" },
    { i: "LW", c: "bg-blue" },
  ];
  return (
    <div className="card rise relative mt-10 p-5" style={{ animationDelay: "120ms" }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-medium text-muted">Richmond → UBC</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xl font-semibold text-ink">
            Maya&apos;s pod <BadgeCheck size={18} className="text-blue" aria-hidden />
          </p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-green/10 px-3 py-1.5 text-sm font-semibold text-green">
          <Timer size={14} aria-hidden /> 25 min
        </span>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <div className="flex -space-x-3">
          {people.map((p) => (
            <span key={p.i} className={`flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-white text-xs font-semibold text-white ${p.c}`}>
              {p.i}
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          {["M", "T", "W", "T", "F"].map((d, i) => (
            <span
              key={i}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${i % 2 === 0 ? "bg-ubc text-white" : "bg-ink/5 text-muted/60"}`}
            >
              {d}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
