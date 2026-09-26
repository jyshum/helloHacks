import Link from "next/link";

export default function RoleSelect() {
  return (
    <main className="screen flex flex-col">
      <header className="pt-8 pb-10">
        <p className="text-sm font-semibold tracking-wide text-blue uppercase">UBC Carpool</p>
        <h1 className="mt-2 text-4xl font-bold leading-tight text-ubc">
          Get to campus together.
        </h1>
        <p className="mt-3 text-muted">
          Verified UBC students only. Split the gas, not the bill.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <Link
          href="/signup?role=driver"
          className="group rounded-card bg-ubc p-6 text-white shadow-lift transition hover:-translate-y-0.5"
        >
          <CarIcon />
          <h2 className="mt-4 text-2xl font-bold">Drive &amp; earn gas money</h2>
          <p className="mt-1 text-white/75">Post your route. Pick up students on the way.</p>
          <span className="mt-5 inline-flex items-center gap-1 font-heading font-semibold">
            I&apos;m driving <span className="transition group-hover:translate-x-1">→</span>
          </span>
        </Link>

        <Link
          href="/signup?role=rider"
          className="group rounded-card border-2 border-sky bg-white p-6 text-ink shadow-soft transition hover:-translate-y-0.5"
        >
          <PinIcon />
          <h2 className="mt-4 text-2xl font-bold text-ubc">Ride &amp; chip in for gas</h2>
          <p className="mt-1 text-muted">Find a driver heading your way.</p>
          <span className="mt-5 inline-flex items-center gap-1 font-heading font-semibold text-sky">
            I need a ride <span className="transition group-hover:translate-x-1">→</span>
          </span>
        </Link>
      </div>

      <p className="mt-auto pt-10 text-center text-sm text-muted">
        Already signed up?{" "}
        <Link href="/login" className="font-semibold text-blue">
          Log in
        </Link>
      </p>
    </main>
  );
}

function CarIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17h14M6 17v2M18 17v2M3 13l2-6a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 7l2 6v4H3z" />
      <circle cx="7.5" cy="13.5" r="1" /><circle cx="16.5" cy="13.5" r="1" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#00A7E1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
