"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const justVerified = useSearchParams().get("verified") === "1";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim().toLowerCase();
    const { error } = await createClient().auth.signInWithPassword({
      email,
      password: String(form.get("password")),
    });
    if (error) {
      setLoading(false);
      if (error.message.toLowerCase().includes("not confirmed")) {
        router.push(`/verify?email=${encodeURIComponent(email)}`);
        return;
      }
      setError(error.message);
      return;
    }
    const sync = await fetch("/api/auth/sync", { method: "POST" }).then((r) => r.json());
    router.push(sync.next === "/verify" ? `/verify?email=${encodeURIComponent(email)}` : sync.next ?? "/map");
    router.refresh();
  }

  return (
    <main className="screen">
      <Link href="/" className="text-sm text-muted">← Back</Link>
      <h1 className="mt-6 text-3xl font-bold text-ubc">Welcome back</h1>
      {justVerified && (
        <p className="mt-3 rounded-2xl bg-green/10 px-4 py-3 text-sm text-green">
          Email verified. Log in to continue.
        </p>
      )}
      <form onSubmit={onSubmit} className="card mt-6 flex flex-col gap-4 p-5">
        <div>
          <label className="label" htmlFor="email">UBC email</label>
          <input id="email" name="email" type="email" required className="input" placeholder="you@student.ubc.ca" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required className="input" />
        </div>
        {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={loading} className="btn-ubc">
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
