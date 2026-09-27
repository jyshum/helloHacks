"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, BadgeCheck, Clock, House, IdCard, ShieldCheck, type LucideIcon } from "lucide-react";
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
        className="pointer-events-auto rounded-full bg-white p-1 shadow-lift"
        aria-label="Open menu"
      >
        <Avatar name={me.full_name} photoUrl={me.photo_url} size={42} tone={mode} />
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex">
          <div className="flex h-full w-[84%] max-w-[340px] flex-col bg-white shadow-lift animate-[slidein_.18s_ease-out]">
            <Link href="/profile/me" onClick={() => setOpen(false)} className="bg-ubc px-5 pb-6 pt-10 text-white">
              <Avatar name={me.full_name} photoUrl={me.photo_url} size={64} tone={mode} />
              <p className="mt-3 font-heading text-2xl font-bold">{me.full_name}</p>
              <div className="mt-1 flex items-center gap-2 text-sm text-white/80">
                <span>★ {Number(me.rating_avg ?? 5).toFixed(1)}</span>
                {me.license_verified && (
                  <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs">
                    <BadgeCheck size={12} aria-hidden /> License verified
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm font-semibold text-sky">View profile →</p>
            </Link>

            <nav className="flex flex-col py-2">
              <MenuItem href="/map" label="Home" icon={House} onClick={() => setOpen(false)} />
              <MenuItem href="/trips" label="Your trips" icon={Clock} onClick={() => setOpen(false)} />
              {me.isAdmin && (
                <Link href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-4 px-5 py-4 font-medium text-ink hover:bg-paper">
                  <ShieldCheck size={20} className="w-6 text-muted" aria-hidden />
                  <span className="flex-1">Review licenses</span>
                  {!!pendingReviews && (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{pendingReviews}</span>
                  )}
                </Link>
              )}
              <MenuItem href="/driver-verify" label="License & car" icon={IdCard} onClick={() => setOpen(false)} />
              {onSwitchMode && (
                <button
                  onClick={() => {
                    onSwitchMode();
                    setOpen(false);
                  }}
                  className="flex items-center gap-4 px-5 py-4 text-left font-medium text-ink hover:bg-paper"
                >
                  <ArrowLeftRight size={20} className="w-6 text-muted" aria-hidden />
                  Switch to {mode === "rider" ? "driving" : "riding"}
                </button>
              )}
            </nav>

            <button onClick={signOut} className="mt-auto border-t border-line px-5 py-4 text-left font-medium text-muted hover:bg-paper">
              Sign out
            </button>
          </div>
          <button className="flex-1 bg-ink/40" aria-label="Close menu" onClick={() => setOpen(false)} />
        </div>,
        document.body
      )}
    </>
  );
}

function MenuItem({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-4 px-5 py-4 font-medium text-ink hover:bg-paper">
      <Icon size={20} className="w-6 text-muted" aria-hidden />
      {label}
    </Link>
  );
}
