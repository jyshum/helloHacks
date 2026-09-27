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

// "35 min", "1 hr", "1 hr 5 min".
export function prettyDuration(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m / 60} hr`;
}

// "08:25" + 27 → "08:52"
export function addMinutes(t: string, mins: number): string {
  return fromMinutes(toMinutes(t) + mins);
}

// Arrival time (minutes after midnight) for a given weekday, honouring per-day overrides.
export function arriveOn(p: Pick<CommuteProfile, "arrive_by" | "day_times">, day: Weekday): number {
  return toMinutes(p.day_times?.[day] ?? p.arrive_by);
}

// When the driver leaves campus for the ride home on a weekday (minutes), or null if they don't.
export function leaveOn(p: Pick<CommuteProfile, "home_leave_at" | "home_day_times">, day: Weekday): number | null {
  const t = p.home_day_times?.[day] ?? p.home_leave_at;
  return t ? toMinutes(t) : null;
}

// "Now" for all pod scheduling. Normally the real time. In a local demo recording the
// server gets DEMO_CLOCK_OFFSET_MS and the page gets the same offset from the root layout,
// so e.g. a Sunday recording can show a Monday-morning commute.
export function clockNow(): Date {
  const offset =
    typeof window !== "undefined"
      ? (window as unknown as { __clockOffset?: number }).__clockOffset ?? 0
      : Number(process.env.DEMO_CLOCK_OFFSET_MS ?? 0);
  return new Date(Date.now() + offset);
}

// Current date/weekday/minutes in Vancouver.
export function vancouverNow(now = clockNow()) {
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
export function nextDateOn(days: Weekday[], cutoffMinutes: number, now = clockNow()): string | null {
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

// A member's pickup on a given day. We store one pickup time (for their first day);
// other days shift with the driver's arrival time for that day.
export function pickupOn(
  pickupTime: string | null | undefined,
  driver: Pick<CommuteProfile, "arrive_by" | "day_times">,
  memberDays: number[],
  day: number
): string | null {
  if (!pickupTime || !memberDays.length) return pickupTime ?? null;
  const offset = arriveOn(driver, memberDays[0] as Weekday) - toMinutes(pickupTime);
  return fromMinutes(arriveOn(driver, day as Weekday) - offset);
}
