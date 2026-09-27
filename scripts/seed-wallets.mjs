// Demo payment history: fills demo users' wallets from their pods' past trips, so the
// wallet and pod screens look lived-in. Riders paid for every trip they rode (topping up
// when short), drivers earned the driver fee + gas and cashed out now and then.
// Only demo users (no login) are touched; real accounts are never given fake money.
// Run after seeding pods:  node --env-file=.env.local scripts/seed-wallets.mjs   (safe to re-run)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

// Same formula as the app, read from src/lib/pricing.ts so they can't drift apart.
const PRICE = readFileSync(new URL("../src/lib/pricing.ts", import.meta.url), "utf8");
const num = (name) => Number(PRICE.match(new RegExp(`${name} = ([\\d.]+)`))?.[1] ?? NaN);
const DRIVER = num("DRIVER_FEE_CENTS"), COMPANY = num("COMPANY_FEE_CENTS"), GAS_KM = num("GAS_PER_KM_CENTS"), TAX = num("TAX_RATE");
if ([DRIVER, COMPANY, GAS_KM, TAX].some(Number.isNaN)) throw new Error("Couldn't read pricing constants from src/lib/pricing.ts");
function fare(a, b) {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  const km = Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 1.3 * 10) / 10;
  const gas = Math.round(km * GAS_KM);
  const sub = DRIVER + COMPANY + gas;
  return { total: sub + Math.round(sub * TAX), driver: DRIVER + gas };
}

const CARD = "Visa •••• 4242", BANK = "Bank •••• 6789";
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00-07:00`).toISOString(); // Vancouver (PDT)
const dayBefore = (date) => new Date(Date.parse(`${date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
const all = async (q, what) => {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await q().range(from, from + 999), what);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
};

async function main() {
  const demo = new Set((await all(() => db.from("users").select("id").is("auth_id", null), "demo users")).map((u) => u.id));
  const names = new Map((await all(() => db.from("users").select("id, full_name"), "names")).map((u) => [u.id, u.full_name]));

  // Start clean: remove all wallet rows of demo users.
  const ids = [...demo];
  for (let i = 0; i < ids.length; i += 200) must(await db.from("wallet_entries").delete().in("user_id", ids.slice(i, i + 200)), "clean");

  const pods = must(await db.from("pods").select("id, driver_id, campus_lat, campus_lng, campus_label").eq("status", "active"), "pods");
  const members = await all(() => db.from("pod_members").select("pod_id, user_id, days, pickup_lat, pickup_lng").eq("role", "rider").eq("status", "active"), "members");
  const trips = await all(() => db.from("pod_trips").select("pod_id, trip_date").eq("status", "completed").order("trip_date"), "trips");
  const skips = new Set((await all(() => db.from("pod_skips").select("pod_id, user_id, trip_date"), "skips")).map((s) => `${s.pod_id}|${s.user_id}|${s.trip_date}`));

  // Every ride that happened: one charge per rider per completed trip on their days.
  const rides = [];
  for (const pod of pods) {
    if (!demo.has(pod.driver_id)) continue;
    const campus = { lat: pod.campus_lat, lng: pod.campus_lng };
    const crew = members.filter((m) => m.pod_id === pod.id && demo.has(m.user_id) && m.pickup_lat != null);
    for (const t of trips.filter((x) => x.pod_id === pod.id)) {
      for (const m of crew) {
        if (!m.days.includes(weekday(t.trip_date)) || skips.has(`${pod.id}|${m.user_id}|${t.trip_date}`)) continue;
        rides.push({ date: t.trip_date, pod, rider: m.user_id, fare: fare({ lat: m.pickup_lat, lng: m.pickup_lng }, campus) });
      }
    }
  }
  rides.sort((a, b) => a.date.localeCompare(b.date));

  const rows = [];
  const balance = new Map();
  const add = (row) => {
    rows.push(row);
    balance.set(row.user_id, (balance.get(row.user_id) ?? 0) + row.amount_cents);
  };
  const started = new Set();
  const start = (user, date) => {
    if (started.has(user)) return;
    started.add(user);
    add({ user_id: user, amount_cents: 2000, kind: "welcome", label: "Welcome credit", idem_key: `welcome:${user}`, created_at: at(dayBefore(date), "18:00") });
  };

  let lastCashout = new Map();
  for (const r of rides) {
    const driver = r.pod.driver_id;
    start(r.rider, r.date);
    start(driver, r.date);
    // Riders top up the night before when they're running low (like the app's auto top-up, in $20s).
    const short = r.fare.total - (balance.get(r.rider) ?? 0);
    if (short > 0) {
      const topup = Math.ceil(short / 2000) * 2000 + (Math.random() < 0.4 ? 2000 : 0);
      add({ user_id: r.rider, amount_cents: topup, kind: "topup", label: `Added from ${CARD}`, created_at: at(dayBefore(r.date), "20:15") });
    }
    add({ user_id: r.rider, amount_cents: -r.fare.total, kind: "ride", other_user_id: driver, label: `Ride to ${r.pod.campus_label}`, created_at: at(r.date, "08:40") });
    add({ user_id: driver, amount_cents: r.fare.driver, kind: "earning", other_user_id: r.rider, label: "Driver fee + gas", created_at: at(r.date, "08:40") });
    // Drivers cash out on Fridays, about every other week.
    const last = lastCashout.get(driver);
    if (weekday(r.date) === 5 && (balance.get(driver) ?? 0) > 3000 && (!last || Date.parse(r.date) - Date.parse(last) > 10 * 86400000)) {
      add({ user_id: driver, amount_cents: -balance.get(driver), kind: "cashout", label: `Sent to ${BANK}`, created_at: at(r.date, "19:30") });
      lastCashout.set(driver, r.date);
    }
  }

  for (let i = 0; i < rows.length; i += 500) must(await db.from("wallet_entries").insert(rows.slice(i, i + 500)), "insert");
  const riders = new Set(rides.map((r) => r.rider)).size;
  console.log(`✓ ${rides.length} paid rides across ${new Set(rides.map((r) => r.pod.id)).size} pods (${riders} riders), ${rows.length} wallet rows.`);
  const sample = rides.at(-1);
  if (sample) console.log(`  e.g. ${names.get(sample.rider)} → ${names.get(sample.pod.driver_id)}: $${(sample.fare.total / 100).toFixed(2)} (driver gets $${(sample.fare.driver / 100).toFixed(2)})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
