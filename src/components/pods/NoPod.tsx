"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, MapPin, Pencil, Users, Zap } from "lucide-react";
import ProfileMenu, { type MenuUser } from "@/components/app/ProfileMenu";
import { prettyTime } from "@/lib/pods/time";

// Rider waiting for a match. Re-checks every 20s so an invite shows up by itself.
export default function NoPod({ me, area, arriveBy, nearbyRiders }: { me: MenuUser; area: string; arriveBy: string; nearbyRiders: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <main className="screen flex flex-col">
      <div className="flex items-center justify-between">
        <ProfileMenu me={me} mode="rider" />
        <Link href="/commute" className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-sm font-semibold text-ink shadow-soft">
          <Pencil size={14} aria-hidden /> Edit commute
        </Link>
      </div>

      <div className="mt-10 flex flex-col items-center text-center">
        <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-frost">
          <span className="absolute h-full w-full animate-ping rounded-full bg-sky/20" />
          <Users size={34} className="relative text-ubc" aria-hidden />
        </span>
        <h1 className="mt-6 font-heading text-2xl font-bold text-ubc">Looking for a driver on your route</h1>
        <p className="mt-2 text-muted">We&apos;ll invite you to a pod the moment a verified UBC driver near you signs up.</p>
      </div>

      <div className="card mt-8 divide-y divide-line px-5">
        <Row icon={<MapPin size={18} aria-hidden />} label="From" value={area} />
        <Row icon={<CalendarClock size={18} aria-hidden />} label="On campus by" value={prettyTime(arriveBy)} />
        <Row
          icon={<Users size={18} aria-hidden />}
          label="Students near you, same time"
          value={nearbyRiders ? `${nearbyRiders} also waiting` : "You're the first. Invite friends!"}
        />
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-8">
        <Link href="/map" className="btn-ubc w-full gap-2 py-4">
          <Zap size={18} aria-hidden /> Need a ride today?
        </Link>
        <p className="text-center text-xs text-muted">Book a one-off ride with a driver heading to campus now.</p>
      </div>
    </main>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 py-3">
      <span className="text-muted">{icon}</span>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="font-medium text-ink">{value}</p>
      </div>
    </div>
  );
}
