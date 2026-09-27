import type { CommuteProfile, Weekday } from "@/lib/pods/types";

const TZ = "America/Vancouver";

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function fromMinutes(mins: number): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// "08:25" → "8:25am"
export function prettyTime(t: string | null | undefined): string {
  if (!t) return "";
  const mins = toMinutes(t);
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

// Arrival time (minutes after midnight) for a given weekday, honouring per-day overrides.
export function arriveOn(p: Pick<CommuteProfile, "arrive_by" | "day_times">, day: Weekday): number {
  return toMinutes(p.day_times?.[day] ?? p.arrive_by);
}

// Current date/weekday/minutes in Vancouver.
export function vancouverNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0=Sun
  return d === 0 ? 7 : d;
}

// Next date (today included if `cutoffMinutes` hasn't passed) that falls on one of `days`.
export function nextDateOn(days: Weekday[], cutoffMinutes: number, now = new Date()): string | null {
  if (!days.length) return null;
  const v = vancouverNow(now);
  for (let i = 0; i < 8; i++) {
    const date = addDays(v.date, i);
    const wd = weekdayOf(date);
    if (!days.includes(wd as Weekday)) continue;
    if (i === 0 && v.minutes > cutoffMinutes) continue;
    return date;
  }
  return null;
}

// A Vancouver wall-clock time on a date → real UTC Date.
export function vancouverTime(date: string, minutes: number): Date {
  const guess = new Date(`${date}T${fromMinutes(minutes)}:00Z`);
  const offsetName = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" })
    .formatToParts(guess)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT-8";
  const offsetHours = Number(offsetName.replace("GMT", "") || 0);
  return new Date(guess.getTime() - offsetHours * 3600 * 1000);
}

export function prettyDate(date: string): string {
  const today = vancouverNow().date;
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

// "today" / "tomorrow" / "Monday": for sentences like "Can't drive Monday".
export function dayWord(date: string): string {
  const today = vancouverNow().date;
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", timeZone: "UTC" });
}
