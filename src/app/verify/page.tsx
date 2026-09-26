"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isDevEnvironment } from "@/lib/auth";

export default function VerifyPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}

function Verify() {
  const router = useRouter();
  const email = useSearchParams().get("email") ?? "";
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    const { error } = await createClient().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/verify/callback` },
    });
    setBusy(false);
    setStatus(error ? error.message : "Sent. Check your inbox (and spam).");
  }

  async function skip() {
    setBusy(true);
    const res = await fetch("/api/dev/skip-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json();
    if (!res.ok) {
      setBusy(false);
      setStatus(body.error);
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: body.token_hash, type: "magiclink" });
    if (error) {
      setBusy(false);
      setStatus(error.message);
      return;
    }
    const sync = await fetch("/api/auth/sync", { method: "POST" }).then((r) => r.json());
    router.push(sync.next ?? "/map");
    router.refresh();
  }

  return (
    <main className="screen flex flex-col items-center justify-center text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-frost">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#002145" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
        </svg>
      </div>
      <h1 className="mt-6 text-3xl font-bold text-ubc">Check your inbox</h1>
      <p className="mt-2 text-muted">
        We sent a verification link to
        <br />
        <span className="font-semibold text-ink">{email || "your UBC email"}</span>
      </p>

      <div className="mt-8 flex w-full flex-col gap-3">
        <button onClick={resend} disabled={busy || !email} className="btn-ghost">
          Resend email
        </button>
        {isDevEnvironment() && (
          <button onClick={skip} disabled={busy || !email} className="btn border border-dashed border-muted text-muted">
            Skip verification (dev only)
          </button>
        )}
      </div>
      {status && <p className="mt-4 text-sm text-muted">{status}</p>}
    </main>
  );
}
