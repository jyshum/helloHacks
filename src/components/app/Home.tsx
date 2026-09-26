"use client";

import { useEffect, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import RiderHome from "@/components/rider/RiderHome";
import DriverHome, { type DriverMe } from "@/components/driver/DriverHome";

const MODE_KEY = "carpool-mode";

// Picks rider or driver home. "both" users can switch from the menu.
export default function Home({ me }: { me: DriverMe }) {
  const canDrive = me.role === "driver" || me.role === "both";
  const canRide = me.role === "rider" || me.role === "both";
  const [mode, setMode] = useState<"rider" | "driver">(canDrive && !canRide ? "driver" : "rider");

  useEffect(() => {
    if (me.role !== "both") return;
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === "driver" || saved === "rider") setMode(saved);
    } catch {}
  }, [me.role]);

  const switchMode =
    me.role === "both"
      ? () =>
          setMode((m) => {
            const next = m === "rider" ? "driver" : "rider";
            try {
              localStorage.setItem(MODE_KEY, next);
            } catch {}
            return next;
          })
      : undefined;

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      {mode === "driver" ? <DriverHome me={me} onSwitchMode={switchMode} /> : <RiderHome me={me} onSwitchMode={switchMode} />}
    </APIProvider>
  );
}
