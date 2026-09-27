"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/app/BackButton";
import type { LicenseReview, Vehicle } from "@/lib/types";

const PROVINCES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"];
const POLL_MS = 5000;

type Props = { licenseVerified: boolean; review: LicenseReview | null; vehicle: Vehicle | null };

export default function DriverVerify({ licenseVerified, review: initialReview, vehicle }: Props) {
  const router = useRouter();
  const [verified, setVerified] = useState(licenseVerified);
  const [review, setReview] = useState(initialReview);
  const [car, setCar] = useState<Vehicle | null>(vehicle);
  const [editingCar, setEditingCar] = useState(!vehicle);
  const [busy, setBusy] = useState<"license" | "car" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = !verified && review?.status === "pending";

  // While under review, check every few seconds so approval shows up live.
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      const res = await fetch("/api/license", { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      setReview(body.review);
      setVerified(body.licenseVerified);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [pending]);

  async function submitLicense(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("license");
    setError(null);
    const res = await fetch("/api/license", { method: "POST", body: new FormData(e.currentTarget) });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) return setError(body.error);
    setReview(body.review);
    setVerified(false);
  }

  async function saveCar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("car");
    setError(null);
    const res = await fetch("/api/vehicles", { method: "POST", body: new FormData(e.currentTarget) });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) return setError(body.error);
    setCar(body.vehicle);
    setEditingCar(false);
  }

  return (
    <main className="screen flex flex-col pb-10">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="font-heading text-2xl font-bold text-ubc">License &amp; car</h1>
      </div>
      <p className="mt-2 text-muted">Every driver is checked by a real person on the hoppedIn team.</p>

      {/* License */}
      <section className="card mt-5 p-5">
        <div className="flex items-center gap-3">
          <StepDot n={1} state={verified ? "done" : pending ? "wait" : "todo"} />
          <h2 className="text-lg font-bold text-ink">Driver&apos;s license</h2>
        </div>

        {verified && (
          <p className="mt-3 rounded-2xl bg-green/10 px-4 py-3 text-sm font-semibold text-green">
            License verified by the hoppedIn team ✓
          </p>
        )}

        {pending && (
          <div className="mt-3 rounded-2xl bg-frost px-4 py-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-ubc">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute h-full w-full animate-ping rounded-full bg-blue/50" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-blue" />
              </span>
              Under review
            </p>
            <p className="mt-1 text-muted">Our team is checking your photos. This page updates on its own. You can keep using the app meanwhile.</p>
          </div>
        )}

        {!verified && !pending && (
          <form onSubmit={submitLicense} className="mt-3 flex flex-col gap-3">
            {review?.status === "rejected" && review.reject_reason && review.reject_reason !== "Replaced by a newer submission" && (
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                <span className="font-semibold">Not approved:</span> {review.reject_reason}. Please resubmit.
              </p>
            )}
            <FilePick name="license" label="Photo of your license" hint="Front side, all text readable" required />
            <FilePick name="selfie" label="Selfie holding your license" hint="Your face and the license in one photo" required />
            <FilePick name="record" label="ICBC driving record (optional)" hint="Download it from icbc.com, PDF or screenshot" accept="image/*,application/pdf" />
            <button type="submit" disabled={busy === "license"} className="btn-ubc mt-1">
              {busy === "license" ? "Uploading…" : "Submit for review"}
            </button>
            <p className="text-center text-xs text-muted">Photos are private. Only the hoppedIn review team can see them.</p>
          </form>
        )}
      </section>

      {/* Car */}
      <section className="card mt-4 p-5">
        <div className="flex items-center gap-3">
          <StepDot n={2} state={car && !editingCar ? "done" : "todo"} />
          <h2 className="text-lg font-bold text-ink">Your car</h2>
        </div>
        {car && !editingCar ? (
          <div className="mt-3">
            {car.photo_url && <img src={car.photo_url} alt="Your car" className="h-40 w-full rounded-2xl object-cover" />}
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="font-heading font-semibold">{car.color} {car.make_model}</p>
                <p className="text-xs text-muted">{car.seat_capacity} seats{car.is_ev ? " · EV" : ""}</p>
              </div>
              <span className="rounded-lg border-2 border-ubc px-2 py-1 font-mono text-sm font-bold text-ubc">{car.license_plate}</span>
            </div>
            <button onClick={() => setEditingCar(true)} className="mt-3 text-sm font-semibold text-blue">Edit car</button>
          </div>
        ) : (
          <form onSubmit={saveCar} className="mt-3 flex flex-col gap-3">
            <input name="make_model" required defaultValue={car?.make_model} className="input" placeholder="Make & model (e.g. Honda Civic)" />
            <div className="grid grid-cols-[1fr_88px] gap-3">
              <input name="license_plate" required defaultValue={car?.license_plate} className="input uppercase" placeholder="Plate" />
              <select name="province" className="input" defaultValue={car?.province ?? "BC"}>
                {PROVINCES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-[1fr_88px] gap-3">
              <input name="color" defaultValue={car?.color} className="input" placeholder="Colour" />
              <select name="seat_capacity" className="input" defaultValue={String(car?.seat_capacity ?? 3)}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="is_ev" defaultChecked={car?.is_ev} className="h-4 w-4 accent-ubc" /> Electric vehicle
            </label>
            <FilePick name="photo" label="Photo of your car" hint="Plate clearly visible. Riders see this to find you." required={!car?.photo_url} />
            <button type="submit" disabled={busy === "car"} className="btn-ghost">{busy === "car" ? "Saving…" : "Save car"}</button>
          </form>
        )}
      </section>

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <button onClick={() => router.push("/map")} className="btn-ubc mt-6 w-full">Back to map</button>
    </main>
  );
}

function FilePick({
  name,
  label,
  hint,
  capture,
  accept = "image/*",
  required,
}: {
  name: string;
  label: string;
  hint: string;
  capture?: "user" | "environment";
  accept?: string;
  required?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-line p-3 hover:bg-paper">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-frost text-xl text-ubc">
        {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : fileName ? "📄" : "📷"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-ink">{label}</span>
        <span className="block truncate text-xs text-muted">{fileName ?? hint}</span>
      </span>
      <input
        type="file"
        name={name}
        accept={accept}
        capture={capture}
        required={required}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setFileName(f?.name ?? null);
          setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
        }}
      />
    </label>
  );
}

function StepDot({ n, state }: { n: number; state: "done" | "wait" | "todo" }) {
  const cls = state === "done" ? "bg-green text-white" : state === "wait" ? "bg-blue text-white" : "bg-frost text-ubc";
  return (
    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${cls}`}>
      {state === "done" ? "✓" : state === "wait" ? "…" : n}
    </span>
  );
}
