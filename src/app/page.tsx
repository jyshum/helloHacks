import Link from "next/link";
import { ArrowRight, Car, Fuel, MapPin, ShieldCheck, UserRound } from "lucide-react";

export default function RoleSelect() {
  return (
    <main className="screen flex flex-col">
      <nav className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-heading text-lg font-bold text-ubc">
          <LogoMark />
          UBC Carpool
        </span>
        <Link href="/login" className="text-sm font-semibold text-blue">
          Log in
        </Link>
      </nav>

      <header className="pt-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-frost px-3 py-1 text-xs font-semibold text-blue">
          <span className="h-1.5 w-1.5 rounded-full bg-green" />
          Verified UBC students only
        </span>
        <h1 className="mt-4 text-4xl font-bold leading-[1.1] text-ubc">
          Get to campus together.
        </h1>
        <p className="mt-3 text-muted">
          Drivers already heading to UBC pick up students on the way. Riders chip in for gas. No fares, no awkward
          Venmo requests.
        </p>
      </header>

      <RoutePreview />

      <div className="mt-8 flex flex-col gap-3">
        <Link href="/signup" className="group btn-ubc gap-2 py-4 text-lg shadow-lift">
          Get started <ArrowRight size={20} className="transition group-hover:translate-x-1" aria-hidden />
        </Link>
        <p className="flex items-center justify-center gap-4 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <span className="text-sky"><MapPin size={16} aria-hidden /></span> Ride
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-ubc"><Car size={16} aria-hidden /></span> Drive
          </span>
          <span>One account for both</span>
        </p>
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">How it works</h2>
        <ol className="mt-4 flex flex-col gap-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-frost font-heading text-sm font-bold text-blue">
                {i + 1}
              </span>
              <div>
                <p className="font-heading font-semibold text-ubc">{step.title}</p>
                <p className="text-sm text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 grid grid-cols-3 gap-2">
        {TRUST.map((t) => (
          <div key={t.label} className="card flex flex-col items-center gap-2 px-2 py-4 text-center">
            <span className="text-green">{t.icon}</span>
            <span className="text-xs font-medium leading-snug text-ink">{t.label}</span>
          </div>
        ))}
      </section>

      <p className="mt-auto pt-10 text-center text-xs text-muted">
        Built at HelloHacks 2026 · Not affiliated with UBC
      </p>
    </main>
  );
}

const STEPS = [
  { title: "Verify with your UBC email", body: "One tap on the link we send to your student inbox." },
  { title: "Post a route or request a pickup", body: "We only match you with drivers a few minutes out of their way." },
  { title: "Ride, split the gas, rate", body: "The gas contribution is worked out for you. No haggling." },
];

const TRUST = [
  { label: "UBC email verified", icon: <ShieldCheck size={22} aria-hidden /> },
  { label: "Cost-sharing, not fares", icon: <Fuel size={22} aria-hidden /> },
  { label: "See profiles before you ride", icon: <UserRound size={22} aria-hidden /> },
];

// A stylised map card: Kitsilano -> UBC with one pickup, showing what a match looks like.
function RoutePreview() {
  return (
    <div className="relative mt-8 overflow-hidden rounded-card border border-line bg-frost shadow-soft">
      <svg viewBox="0 0 400 200" className="block h-auto w-full" aria-hidden="true">
        {/* street grid */}
        <g stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" opacity="0.9">
          <path d="M0 60 H400" />
          <path d="M0 130 H400" />
          <path d="M90 0 V200" />
          <path d="M220 0 V200" />
          <path d="M330 0 V200" />
        </g>
        {/* water */}
        <path d="M0 0 H400 V22 C300 34 180 14 0 30 Z" fill="#CFE6F5" />
        {/* route */}
        <path
          d="M40 168 C100 168 120 130 175 130 S300 118 356 58"
          fill="none"
          stroke="#002145"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {/* origin */}
        <circle cx="40" cy="168" r="7" fill="#FFFFFF" stroke="#002145" strokeWidth="4" />
        {/* pickup */}
        <circle cx="175" cy="130" r="13" fill="#00A7E1" opacity="0.25" />
        <circle cx="175" cy="130" r="6" fill="#00A7E1" stroke="#FFFFFF" strokeWidth="2" />
        <text x="160" y="158" fontSize="11" fill="#0055B7" fontWeight="600" fontFamily="system-ui">Pickup</text>
        {/* campus */}
        <path d="M356 64 c-8-9-12-15-12-20a12 12 0 1 1 24 0c0 5-4 11-12 20z" fill="#002145" />
        <circle cx="356" cy="44" r="4" fill="#FFFFFF" />
        <text x="22" y="192" fontSize="11" fill="#6B7C93" fontFamily="system-ui">Kitsilano</text>
        <text x="338" y="48" textAnchor="end" fontSize="11" fill="#002145" fontWeight="600" fontFamily="system-ui">UBC</text>
      </svg>

      <div className="absolute left-3 top-8 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-soft">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ubc text-xs font-bold text-white">
          PS
        </span>
        <span className="leading-tight">
          <span className="block text-xs font-semibold text-ink">Priya · Applied Sci</span>
          <span className="block text-[11px] text-muted">★ 4.9 · Honda Civic</span>
        </span>
      </div>

      <div className="absolute bottom-3 right-3 rounded-2xl bg-white px-3 py-2 text-right shadow-soft">
        <span className="block text-[11px] text-muted">+2 min detour</span>
        <span className="block font-heading text-sm font-bold text-green">Gas: $2.55</span>
      </div>
    </div>
  );
}

function LogoMark() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ubc text-white">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 18c4 0 4-8 8-8s4 8 8 8" />
        <circle cx="12" cy="10" r="2" fill="currentColor" />
      </svg>
    </span>
  );
}
