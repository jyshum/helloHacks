"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { FACULTIES, isAllowedEmail, allowedDomains } from "@/lib/auth";

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailInvalid = emailTouched && email.includes("@") && !isAllowedEmail(email);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!isAllowedEmail(email)) {
      setEmailTouched(true);
      return;
    }
    setLoading(true);
    // Every account can both ride and drive; the mode is picked after login.
    const form = new FormData(e.currentTarget);
    form.set("role", "both");
    const res = await fetch("/api/signup", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Something went wrong. Try again.");
      return;
    }
    router.push(`/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`);
  }

  return (
    <main className="screen">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted">
        <ArrowLeft size={16} aria-hidden /> Back
      </Link>
      <div className="mt-4 mb-6">
        <Logo variant="mark" height={30} />
        <h1 className="mt-4 text-3xl font-bold text-ubc">Create your account</h1>
        <p className="mt-1 text-muted">
          One account to ride and drive. We&apos;ll send a link to your UBC inbox.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card flex flex-col gap-4 p-5">
        <label className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-frost text-muted">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl">+</span>
            )}
          </div>
          <div className="text-sm">
            <span className="font-semibold text-blue">Add a photo</span>
            <p className="text-muted">Helps your match recognize you.</p>
          </div>
          <input
            type="file"
            name="photo"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
          />
        </label>

        <div>
          <label className="label" htmlFor="full_name">Full name</label>
          <input id="full_name" name="full_name" required className="input" placeholder="Alex Chen" />
        </div>

        <div>
          <label className="label" htmlFor="email">UBC email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            className={`input ${emailInvalid ? "border-red-400 ring-2 ring-red-200" : ""}`}
            placeholder="you@student.ubc.ca"
          />
          {emailInvalid && (
            <p className="mt-1 text-sm text-red-600">
              UBC emails only. Use an address ending in {allowedDomains().map((d) => `@${d}`).join(", ")}.
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={6} className="input" placeholder="At least 6 characters" />
        </div>

        <div className="grid grid-cols-[1fr_96px] gap-3">
          <div>
            <label className="label" htmlFor="faculty">Faculty</label>
            <select id="faculty" name="faculty" className="input" defaultValue="">
              <option value="" disabled>Select</option>
              {FACULTIES.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="year">Year</label>
            <select id="year" name="year" className="input" defaultValue="">
              <option value="" disabled>–</option>
              {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y === 5 ? "5+" : y}</option>)}
            </select>
          </div>
        </div>

        {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={loading} className="btn-ubc">
          {loading ? "Creating account…" : "Continue"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already signed up? <Link href="/login" className="font-semibold text-blue">Log in</Link>
      </p>
    </main>
  );
}
