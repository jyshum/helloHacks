"use client";

import { usePathname } from "next/navigation";

// Every new screen slides in from the right. Keyed on the path so it replays on each navigation.
// min-h keeps full-screen fixed children (maps) sized to the viewport while the slide runs.
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div key={path} className="page-in min-h-[100dvh]">
      {children}
    </div>
  );
}
