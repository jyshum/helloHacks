"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, BadgeCheck, Clock, House, IdCard, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/Avatar";
import type { Role } from "@/lib/types";

export type MenuUser = {
  id: string;
  full_name: string;
  photo_url: string | null;
  role: Role;
  rating_avg: number;
  license_verified: boolean;
  isAdmin?: boolean;
};

// Uber-style: avatar button top-left opens a side drawer.
export default function ProfileMenu({
  me,
  mode,
  onSwitchMode,
}: {
  me: MenuUser;
  mode: "rider" | "driver";
  onSwitchMode?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Admins see how many licenses are waiting, refreshed each time the menu opens.
  const [pendingReviews, setPendingReviews] = useState<number | null>(null);
  useEffect(() => {
    if (!open || !me.isAdmin) return;
    fetch("/api/admin/licenses?count=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setPendingReviews(b.pending ?? 0))
      .catch(() => {});
  }, [open, me.isAdmin]);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="glass pointer-events-auto rounded-full p-1"
        aria-label="Open menu"
      >
        <Avatar name={me.full_name} photoUrl={me.photo_url} size={42} tone={mode} />
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex">
          <div className="relative z-10 flex h-full w-[84%] max-w-[340px] flex-col border-r border-white/60 bg-white/75 shadow-lift backdrop-blur-2xl backdrop-saturate-150 animate-[slidein_.38s_cubic-bezier(0.32,0.72,0,1)]">
            <Link href="/profile/me" onClick={() => setOpen(false)} className="px-5 pb-6 pt-12">
              <Avatar name={me.full_name} photoUrl={me.photo_url} size={64} tone={mode} />
              <p className="mt-3 text-2xl font-bold tracking-tight text-ubc">{me.full_name}</p>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted">
                <span>★ {Number(me.rating_avg ?? 5).toFixed(1)}</span>
                {me.license_verified && (
                  <span className="flex items-center gap-1 rounded-full bg-blue/10 px-2 py-0.5 text-xs font-semibold text-blue">
                    <BadgeCheck size={12} aria-hidden /> License verified
                  </span>
                )}
              </div>
              
            </Link>

            <nav className="flex flex-col py-2">
              <MenuItem href="/pods" label="My pods" icon={Users} onClick={() => setOpen(false)} />
              <MenuItem href="/map" label="Ride today" icon={House} onClick={() => setOpen(false)} />
              <MenuItem href="/trips" label="Your trips" icon={Clock} onClick={() => setOpen(false)} />
              {me.isAdmin && (
                <Link href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-4 px-5 py-4 font-medium text-ink hover:bg-white/60">
                  <ShieldCheck size={20} className="w-6 text-muted" aria-hidden />
                  <span className="flex-1">Review licenses</span>
                  {!!pendingReviews && (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{pendingReviews}</span>
                  )}
                </Link>
              )}
              <MenuItem href="/driver-verify" label="Verification" icon={IdCard} onClick={() => setOpen(false)} />
              {onSwitchMode && (
                <button
                  onClick={() => {
                    onSwitchMode();
                    setOpen(false);
                  }}
                  className="flex items-center gap-4 px-5 py-4 text-left font-medium text-ink hover:bg-white/60"
                >
                  <ArrowLeftRight size={20} className="w-6 text-muted" aria-hidden />
                  Switch to {mode === "rider" ? "driving" : "riding"}
                </button>
              )}
            </nav>

            <button onClick={signOut} className="mt-auto px-5 py-6 text-left text-sm font-medium text-muted hover:text-ink">
              Sign out
            </button>
          </div>
          <button className="fade-in flex-1 bg-ink/25 backdrop-blur-[2px]" aria-label="Close menu" onClick={() => setOpen(false)} />
        </div>,
        document.body
      )}
    </>
  );
}

function MenuItem({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-4 px-5 py-4 font-medium text-ink hover:bg-white/60">
      <Icon size={20} className="w-6 text-muted" aria-hidden />
      {label}
    </Link>
  );
}
