"use client";

import { useEffect, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { Car, ChevronRight, MapPin } from "lucide-react";
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
      <p className="text-sm font-medium text-muted">Hi {first}</p>
      <h1 className="mt-1 text-[34px] font-bold leading-tight text-ubc">Today</h1>
      

      <div className="mt-8 flex flex-col gap-3">
        <button
          onClick={() => onChoose("rider")}
          className="glass group flex items-center gap-4 rounded-card p-5 text-left transition hover:-translate-y-0.5"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky/10 text-sky">
            <MapPin size={26} aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block text-lg font-semibold text-ubc">Ride</span>
            
          </span>
          <ChevronRight size={20} className="text-sky" aria-hidden />
        </button>

        <button
          onClick={() => onChoose("driver")}
          className="group flex items-center gap-4 rounded-card bg-ubc p-5 text-left text-white shadow-glow transition hover:-translate-y-0.5"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
            <Car size={26} aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block text-lg font-semibold">Drive</span>
            
          </span>
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>
    </main>
  );
}
