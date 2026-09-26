"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Vehicle } from "@/lib/types";

const PROVINCES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"];

type Props = { licenseVerified: boolean; vehicle: Vehicle | null };

export default function DriverVerify(props: Props) {
  return (
    <Suspense>
      <DriverVerifyInner {...props} />
    </Suspense>
  );
}

function DriverVerifyInner({ licenseVerified, vehicle }: Props) {
  const router = useRouter();
  const returned = useSearchParams().get("returned") === "1";
  const [verified, setVerified] = useState(licenseVerified);
  const [idvStatus, setIdvStatus] = useState<string | null>(null);
  const [savedVehicle, setSavedVehicle] = useState<Vehicle | null>(vehicle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Coming back from Stripe: poll until the check finishes processing.
  const checkStatus = useCallback(async () => {
    const res = await fetch("/api/identity/status", { cache: "no-store" });
    const body = await res.json();
    setIdvStatus(body.status);
    if (body.verified) setVerified(true);
    if (body.status === "requires_input" && body.error) setError(`Stripe couldn't verify that: ${body.error.replace(/_/g, " ")}. Try again.`);
    return { status: body.status as string, failed: !!body.error };
  }, []);

  useEffect(() => {
    if (!returned || verified) return;
    let tries = 0;
    let stop = false;
    // Stripe can report requires_input for a moment right after the redirect,
    // so keep polling until it's verified, canceled, or has an error.
    const poll = async () => {
      const { status, failed } = await checkStatus();
      const pending = status === "processing" || (status === "requires_input" && !failed);
      if (!stop && pending && tries++ < 20) setTimeout(poll, 1500);
    };
    poll();
    return () => {
      stop = true;
    };
  }, [returned, verified, checkStatus]);

  async function startVerification() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/identity/session", { method: "POST" });
    const body = await res.json();
    if (!res.ok || !body.url) {
      setBusy(false);
      return setError(body.error ?? "Couldn't start verification.");
    }
    window.location.href = body.url;
  }

  async function saveVehicle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        make_model: f.get("make_model"),
        license_plate: f.get("license_plate"),
        province: f.get("province"),
        color: f.get("color"),
        seat_capacity: f.get("seat_capacity"),
        is_ev: f.get("is_ev") === "on",
      }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error);
    setSavedVehicle(body.vehicle);
  }

  const done = verified && !!savedVehicle;

  return (
    <main className="screen flex flex-col">
      <span className="inline-block w-fit rounded-full bg-ubc px-3 py-1 text-xs font-semibold text-white">Driver</span>
      <h1 className="mt-3 text-3xl font-bold text-ubc">Verify to drive</h1>
      <p className="mt-1 text-muted">Riders see a verified badge on your profile.</p>

      {/* Step 1: license */}
      <section className="card mt-6 p-5">
        <div className="flex items-center gap-3">
          <StepDot n={1} done={verified} />
          <h2 className="text-lg font-bold text-ink">Driver&apos;s license</h2>
        </div>
        {verified ? (
          <p className="mt-3 rounded-2xl bg-green/10 px-4 py-3 text-sm font-semibold text-green">License verified ✓</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted">
              Snap your license and a quick selfie. Stripe checks the license is authentic and that it&apos;s you.
            </p>
            {returned && (idvStatus === "processing" || idvStatus === "requires_input") && !error && <p className="mt-3 text-sm text-blue">Checking your license…</p>}
            <button onClick={startVerification} disabled={busy} className="btn-ubc mt-4 w-full">
              {idvStatus === "requires_input" ? "Try again" : "Verify license"}
            </button>
            <p className="mt-2 text-center text-xs text-muted">
              Secured by Stripe Identity. Document + face match only, no government database lookup.
            </p>
          </>
        )}
      </section>

      {/* Step 2: vehicle */}
      <section className="card mt-4 p-5">
        <div className="flex items-center gap-3">
          <StepDot n={2} done={!!savedVehicle} />
          <h2 className="text-lg font-bold text-ink">Your car</h2>
        </div>
        {savedVehicle ? (
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-frost px-4 py-3">
            <div>
              <p className="font-heading font-semibold">{savedVehicle.color} {savedVehicle.make_model}</p>
              <p className="text-xs text-muted">{savedVehicle.seat_capacity} seats{savedVehicle.is_ev ? " · EV" : ""}</p>
            </div>
            <span className="rounded-lg border-2 border-ubc px-2 py-1 font-mono text-sm font-bold text-ubc">
              {savedVehicle.license_plate}
            </span>
          </div>
        ) : (
          <form onSubmit={saveVehicle} className="mt-3 flex flex-col gap-3">
            <input name="make_model" required className="input" placeholder="Make & model (e.g. Honda Civic)" />
            <div className="grid grid-cols-[1fr_88px] gap-3">
              <input name="license_plate" required className="input uppercase" placeholder="Plate" />
              <select name="province" className="input" defaultValue="BC">
                {PROVINCES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-[1fr_88px] gap-3">
              <input name="color" className="input" placeholder="Colour" />
              <select name="seat_capacity" className="input" defaultValue="3">
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="is_ev" className="h-4 w-4 accent-ubc" /> Electric vehicle
            </label>
            <button type="submit" disabled={busy} className="btn-ghost">Save car</button>
          </form>
        )}
      </section>

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-auto pt-6">
        <button onClick={() => router.push("/map")} disabled={!done} className="btn-ubc w-full">
          Continue to map
        </button>
        {!done && (
          <Link href="/map" className="mt-2 block text-center text-sm text-muted">
            Skip for now
          </Link>
        )}
      </div>
    </main>
  );
}

function StepDot({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
        done ? "bg-green text-white" : "bg-frost text-ubc"
      }`}
    >
      {done ? "✓" : n}
    </span>
  );
}
