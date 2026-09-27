"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Car, Check, LocateFixed, MapPin, Minus, Plus, Search, ShieldCheck, User } from "lucide-react";
import { nearestArea } from "@/lib/areas";
import { CAMPUS_SPOTS } from "@/lib/places";
import { WEEKDAY_LABELS, type CommuteMode, type CommuteProfile, type Weekday } from "@/lib/pods/types";

type Home = { lat: number; lng: number; label: string };
type Step = "mode" | "home" | "schedule" | "seats" | "saving";

const DAYS: Weekday[] = [1, 2, 3, 4, 5];
// 7:00am – 1:00pm in 15 min steps.
const TIMES = Array.from({ length: 25 }, (_, i) => {
  const m = 7 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
const pretty = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
};

export default function CommuteOnboarding({
  firstName,
  existing,
  licenseVerified,
}: {
  firstName: string;
  existing: CommuteProfile | null;
  licenseVerified: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<CommuteMode | null>(existing?.mode ?? null);
  const [home, setHome] = useState<Home | null>(
    existing ? { lat: existing.home_lat, lng: existing.home_lng, label: existing.home_area ?? "Saved home" } : null
  );
  const [days, setDays] = useState<Weekday[]>(existing?.days ?? []);
  // One arrival time per weekday. Saved as a default (arrive_by) + overrides (day_times).
  const base = existing?.arrive_by?.slice(0, 5) ?? "09:00";
  const [times, setTimes] = useState<Record<Weekday, string>>(() =>
    Object.fromEntries(DAYS.map((d) => [d, existing?.day_times?.[d] ?? base])) as Record<Weekday, string>
  );
  const [campus, setCampus] = useState(CAMPUS_SPOTS.find((c) => c.label === existing?.campus_label) ?? CAMPUS_SPOTS[0]);
  const [seats, setSeats] = useState(existing?.seats ?? 3);
  const [error, setError] = useState<string | null>(null);

  const steps: Step[] = mode === "driver" ? ["mode", "home", "schedule", "seats"] : ["mode", "home", "schedule"];
  const index = Math.max(0, steps.indexOf(step));

  async function save() {
    setStep("saving");
    setError(null);
    const res = await fetch("/api/commute", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        home: home && { lat: home.lat, lng: home.lng },
        campus: { lat: campus.lat, lng: campus.lng },
        campus_label: campus.label,
        days,
        ...splitTimes(days, times),
        seats,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Couldn't save. Try again.");
      setStep(mode === "driver" ? "seats" : "schedule");
      return;
    }
    router.push(body.podId ? `/pods/${body.podId}` : "/pods");
    router.refresh();
  }

  function back() {
    if (index === 0) return router.back();
    setStep(steps[index - 1]);
  }

  if (step === "saving") {
    return (
      <main className="screen flex flex-col items-center justify-center text-center">
        <span className="relative flex h-16 w-16 items-center justify-center">
          <span className="absolute h-full w-full animate-ping rounded-full bg-sky/30" />
          <Car size={32} className="relative text-ubc" aria-hidden />
        </span>
        <h1 className="mt-6 font-heading text-2xl font-bold text-ubc">Finding your pod…</h1>
        <p className="mt-2 text-muted">Matching you with UBC students on your route and schedule.</p>
      </main>
    );
  }

  return (
    <main className="screen flex flex-col">
      <div className="flex items-center gap-3">
        <button onClick={back} className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-soft" aria-label="Back">
          <ArrowLeft size={20} aria-hidden />
        </button>
        <div className="flex flex-1 gap-1.5">
          {steps.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-ubc" : "bg-line"}`} />
          ))}
        </div>
      </div>

      {step === "mode" && (
        <section className="mt-8 flex flex-1 flex-col">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue">Hi {firstName}</p>
          <h1 className="mt-1 font-heading text-3xl font-bold leading-tight text-ubc">How do you get to campus?</h1>
          <p className="mt-2 text-muted">We&apos;ll match you into a pod that rides together every week.</p>
          <div className="mt-8 flex flex-col gap-3">
            <ModeCard
              selected={mode === "driver"}
              onClick={() => {
                setMode("driver");
                setStep("home");
              }}
              icon={<Car size={26} aria-hidden />}
              title="I drive"
              text="Pick up students on your way. Never drive alone."
              dark
            />
            <ModeCard
              selected={mode === "rider"}
              onClick={() => {
                setMode("rider");
                setStep("home");
              }}
              icon={<User size={26} aria-hidden />}
              title="I need a ride"
              text="Skip the transfers. Ride with the same people every week."
            />
          </div>
        </section>
      )}

      {step === "home" && (
        <section className="mt-8 flex flex-1 flex-col">
          <h1 className="font-heading text-3xl font-bold leading-tight text-ubc">Where do you commute from?</h1>
          <p className="mt-2 text-muted">Others only ever see your neighbourhood, never your address.</p>
          <HomePicker value={home} onChange={setHome} />
          <div className="mt-auto pt-6">
            <button disabled={!home} onClick={() => setStep("schedule")} className="btn-ubc w-full py-4">Continue</button>
          </div>
        </section>
      )}

      {step === "schedule" && (
        <section className="mt-8 flex flex-1 flex-col">
          <h1 className="font-heading text-3xl font-bold leading-tight text-ubc">When do you need to be on campus?</h1>
          <p className="mt-2 text-muted">Tick your campus days and when your first class starts each day.</p>

          <div className="mt-6 flex flex-col gap-2">
            {DAYS.map((d) => {
              const on = days.includes(d);
              return (
                <div key={d} className={`flex items-center gap-3 rounded-2xl p-2 pl-3 transition ${on ? "bg-white shadow-soft" : "bg-line/40"}`}>
                  <button
                    onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d].sort())}
                    className={`flex w-[92px] shrink-0 items-center gap-2 font-heading font-semibold ${on ? "text-ubc" : "text-muted"}`}
                    aria-pressed={on}
                    aria-label={`${WEEKDAY_LABELS[d]} ${on ? "on" : "off"}`}
                  >
                    <span className={`flex h-6 w-6 items-center justify-center rounded-md border-2 ${on ? "border-ubc bg-ubc text-white" : "border-muted/40"}`}>
                      {on && <Check size={14} strokeWidth={3} aria-hidden />}
                    </span>
                    {WEEKDAY_LABELS[d]}
                  </button>
                  {on ? (
                    <select
                      aria-label={`Arrive by on ${WEEKDAY_LABELS[d]}`}
                      className="input flex-1 py-2.5"
                      value={times[d]}
                      onChange={(e) => setTimes({ ...times, [d]: e.target.value })}
                    >
                      {TIMES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
                    </select>
                  ) : (
                    <span className="flex-1 py-2.5 text-sm text-muted">Not on campus</span>
                  )}
                </div>
              );
            })}
          </div>
          {days.length > 1 && (
            <button
              onClick={() => {
                const t = times[days[0]];
                setTimes(Object.fromEntries(DAYS.map((d) => [d, t])) as Record<Weekday, string>);
              }}
              className="mt-2 self-start text-sm font-semibold text-blue"
            >
              Use {pretty(times[days[0]])} for every day
            </button>
          )}

          <label className="label mt-6" htmlFor="campus">Where on campus?</label>
          <select id="campus" className="input" value={campus.label} onChange={(e) => setCampus(CAMPUS_SPOTS.find((c) => c.label === e.target.value)!)}>
            {CAMPUS_SPOTS.map((c) => <option key={c.label}>{c.label}</option>)}
          </select>

          {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <div className="mt-auto pt-6">
            <button
              disabled={!days.length}
              onClick={() => (mode === "driver" ? setStep("seats") : save())}
              className="btn-ubc w-full py-4"
            >
              {mode === "driver" ? "Continue" : "Find my pod"}
            </button>
          </div>
        </section>
      )}

      {step === "seats" && (
        <section className="mt-8 flex flex-1 flex-col">
          <h1 className="font-heading text-3xl font-bold leading-tight text-ubc">How many riders can you take?</h1>
          <p className="mt-2 text-muted">You approve everyone before they join.</p>
          <div className="mt-8 flex items-center justify-center gap-8">
            <button onClick={() => setSeats(Math.max(1, seats - 1))} className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-soft" aria-label="Fewer seats">
              <Minus size={22} aria-hidden />
            </button>
            <span className="w-16 text-center font-heading text-6xl font-bold text-ubc">{seats}</span>
            <button onClick={() => setSeats(Math.min(6, seats + 1))} className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-soft" aria-label="More seats">
              <Plus size={22} aria-hidden />
            </button>
          </div>

          <Link href="/driver-verify" className="card mt-10 flex items-center gap-3 p-4">
            <ShieldCheck size={24} className={licenseVerified ? "text-green" : "text-blue"} aria-hidden />
            <span className="flex-1 text-sm">
              <span className="block font-semibold text-ink">{licenseVerified ? "License verified" : "Verify your license & car"}</span>
              <span className="block text-muted">{licenseVerified ? "Riders will see your badge." : "Riders trust verified drivers more. Takes 2 minutes."}</span>
            </span>
          </Link>

          {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <div className="mt-auto pt-6">
            <button onClick={save} className="btn-ubc w-full py-4">Find my riders</button>
          </div>
        </section>
      )}
    </main>
  );
}

function ModeCard({ selected, onClick, icon, title, text, dark }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string; dark?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-4 rounded-card p-5 text-left transition hover:-translate-y-0.5 ${
        dark ? "bg-ubc text-white shadow-lift" : "border-2 border-sky bg-white shadow-soft"
      } ${selected ? "ring-4 ring-sky/40" : ""}`}
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${dark ? "bg-white/10" : "bg-sky/10 text-sky"}`}>{icon}</span>
      <span className="flex-1">
        <span className={`block font-heading text-xl font-bold ${dark ? "" : "text-ubc"}`}>{title}</span>
        <span className={`block text-sm ${dark ? "text-white/75" : "text-muted"}`}>{text}</span>
      </span>
      {selected && <Check size={20} aria-hidden />}
    </button>
  );
}

// Address search (Google Places) or GPS. Shows the neighbourhood we'll display to others.
function HomePicker({ value, onChange }: { value: Home | null; onChange: (h: Home) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ placeId: string; main: string; secondary: string }[]>([]);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (q.trim().length < 3) return setResults([]);
    const t = setTimeout(async () => {
      const body = await fetch("/api/places/autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: q }),
      }).then((r) => r.json()).catch(() => ({}));
      setResults(body.suggestions ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function pick(placeId: string, main: string) {
    const res = await fetch(`/api/places/details?id=${encodeURIComponent(placeId)}`);
    if (!res.ok) return;
    const p = await res.json();
    onChange({ lat: p.lat, lng: p.lng, label: main });
    setQ("");
    setResults([]);
  }

  function gps() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        onChange({ lat: p.coords.latitude, lng: p.coords.longitude, label: "Current location" });
      },
      () => {
        setLocating(false);
        alert("Couldn't get your location. Type your address instead.");
      }
    );
  }

  return (
    <div className="mt-6">
      {value && (
        <div className="card mb-4 flex items-center gap-3 p-4">
          <span className="row-icon bg-ubc text-white"><MapPin size={18} aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-ink">{value.label}</span>
            <span className="block text-sm text-muted">Shown to others as <b>{nearestArea(value)}</b></span>
          </span>
          <Check size={20} className="text-green" aria-hidden />
        </div>
      )}
      <div className="flex items-center gap-2 rounded-2xl bg-white px-4 shadow-soft">
        <Search size={18} className="text-muted" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={value ? "Change address or postal code" : "Your address or postal code"}
          className="w-full bg-transparent py-4 outline-none"
        />
      </div>
      {results.length > 0 && (
        <div className="card mt-2 divide-y divide-line overflow-hidden">
          {results.map((r) => (
            <button key={r.placeId} onClick={() => pick(r.placeId, r.main)} className="row px-4">
              <MapPin size={18} className="shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{r.main}</span>
                <span className="block truncate text-sm text-muted">{r.secondary}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <button onClick={gps} className="mt-3 flex items-center gap-2 font-semibold text-blue">
        <LocateFixed size={18} aria-hidden /> {locating ? "Finding you…" : "Use my current location"}
      </button>
    </div>
  );
}

// Most common time becomes the default; other days are saved as overrides.
function splitTimes(days: Weekday[], times: Record<Weekday, string>) {
  const counts = new Map<string, number>();
  days.forEach((d) => counts.set(times[d], (counts.get(times[d]) ?? 0) + 1));
  const arrive_by = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "09:00";
  const day_times = Object.fromEntries(days.filter((d) => times[d] !== arrive_by).map((d) => [d, times[d]]));
  return { arrive_by, day_times };
}
