"use client";

import { useEffect, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import RiderHome from "@/components/rider/RiderHome";
import DriverHome, { type DriverMe } from "@/components/driver/DriverHome";

type Mode = "rider" | "driver";

// Per-tab so a refresh keeps the choice, but a fresh visit asks again.
const MODE_KEY = "carpool-mode";

// Every account can ride and drive. The user picks a mode each visit, and the
// map broadcasts that mode (not the account role) so riders see drivers and
// drivers see riders.
export default function Home({ me }: { me: DriverMe }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(MODE_KEY);
      if (saved === "driver" || saved === "rider") setMode(saved);
    } catch {}
    setReady(true);
  }, []);

  function choose(next: Mode | null) {
    setMode(next);
    try {
      if (next) sessionStorage.setItem(MODE_KEY, next);
      else sessionStorage.removeItem(MODE_KEY);
    } catch {}
  }

  if (!ready) return null;
  if (!mode) return <ModeChooser name={me.full_name} onChoose={choose} />;

  const switchMode = () => choose(mode === "rider" ? "driver" : "rider");
  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      {mode === "driver" ? <DriverHome me={me} onSwitchMode={switchMode} /> : <RiderHome me={me} onSwitchMode={switchMode} />}
    </APIProvider>
  );
}

function ModeChooser({ name, onChoose }: { name: string; onChoose: (m: Mode) => void }) {
  const first = name.split(" ")[0];
  return (
    <main className="screen flex flex-col justify-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue">Hi {first}</p>
      <h1 className="mt-2 text-3xl font-bold leading-tight text-ubc">What are you doing today?</h1>
      <p className="mt-2 text-muted">You can switch any time from the menu.</p>

      <div className="mt-8 flex flex-col gap-3">
        <button
          onClick={() => onChoose("rider")}
          className="group flex items-center gap-4 rounded-card border-2 border-sky bg-white p-5 text-left shadow-soft transition hover:-translate-y-0.5"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky/10 text-sky">
            <PinIcon />
          </span>
          <span className="flex-1">
            <span className="block font-heading text-lg font-bold text-ubc">I need a ride</span>
            <span className="block text-sm text-muted">Nearby drivers can see your pickup and profile.</span>
          </span>
          <span className="text-sky">→</span>
        </button>

        <button
          onClick={() => onChoose("driver")}
          className="group flex items-center gap-4 rounded-card bg-ubc p-5 text-left text-white shadow-lift transition hover:-translate-y-0.5"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
            <CarIcon />
          </span>
          <span className="flex-1">
            <span className="block font-heading text-lg font-bold">I&apos;m driving</span>
            <span className="block text-sm text-white/70">Riders on your way can see your route.</span>
          </span>
          <span>→</span>
        </button>
      </div>
    </main>
  );
}

function CarIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17h14M6 17v2M18 17v2M3 13l2-6a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 7l2 6v4H3z" />
      <circle cx="7.5" cy="13.5" r="1" /><circle cx="16.5" cy="13.5" r="1" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
