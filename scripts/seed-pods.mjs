// Seeds ~150 demo commuters (45 drivers, 105 riders) across Metro Vancouver, forms pods
// with the real matching engine, then adds chat, trip history and ratings so pods feel used.
//
//   npm run seed:pods
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, CRON_SECRET, and `npm run dev` running (for the rebuild step).
// Safe to re-run: every seed row lives in a fixed UUID range that is wiped first.
// The rebuild step calls Google a lot (~$5 per full run), so don't run this in a loop.

import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAPS_KEY = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = (process.env.SEED_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

for (const [name, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: MAPS_KEY, CRON_SECRET })) {
  if (!v) fail(`Missing ${name} in .env.local`);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// --- Sizes and ranges ----------------------------------------------------------------

const DRIVERS = 45;
const RIDERS = 105;
const ROUTE_RIDER_SHARE = 0.7; // riders placed along a driver's route so real pods form
const RANGE = { users: "5eed1000", vehicles: "5eed2000", messages: "5eed5000", trips: "5eed6000", ratings: "5eed7000" };
const lo = (p) => `${p}-0000-0000-0000-000000000000`;
const next = (p) => `${(parseInt(p, 16) + 0x1000).toString(16)}-0000-0000-0000-000000000000`;
const uuid = (p, n) => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;

// --- Deterministic randomness (same data every run) -------------------------------

let seed = 20260927;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + rand() * (b - a);
const chance = (p) => rand() < p;
function weighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- Read shared constants straight from the app source (single source of truth) ----

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const AREAS = [...src("src/lib/areas.ts").matchAll(/\{ name: "([^"]+)", lat: ([-\d.]+), lng: ([-\d.]+) \}/g)].map((m) => ({
  name: m[1],
  lat: Number(m[2]),
  lng: Number(m[3]),
}));
const FACULTIES = [...src("src/lib/auth.ts").match(/FACULTIES = \[([\s\S]*?)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const CAMPUS = [...src("src/lib/places.ts").split("CAMPUS_SPOTS")[1].matchAll(/\{ label: "([^"]+)", lat: ([-\d.]+), lng: ([-\d.]+) \}/g)].map((m) => ({
  label: m[1],
  lat: Number(m[2]),
  lng: Number(m[3]),
}));
if (AREAS.length < 20 || FACULTIES.length < 5 || CAMPUS.length < 4) fail("Couldn't read areas/faculties/campus spots from src/lib.");
const area = (name) => AREAS.find((a) => a.name === name) ?? fail(`Area "${name}" not in src/lib/areas.ts`);
const campusSpot = (label) => CAMPUS.find((c) => c.label.startsWith(label)) ?? fail(`Campus spot "${label}" not in src/lib/places.ts`);

// Commuter spread across Metro Vancouver (share of all seed users).
const REGIONS = [
  [["Richmond Centre", "Steveston", "East Richmond"], 20],
  [["Metrotown", "Brentwood", "Burnaby Heights", "Edmonds"], 18],
  [["Point Grey", "Kitsilano", "Dunbar", "Kerrisdale", "Arbutus Ridge", "Shaughnessy", "Fairview", "Downtown", "West End", "Oakridge", "Marpole"], 20],
  [["Mount Pleasant", "Sunset", "Kensington", "Commercial Drive", "Hastings-Sunrise", "Killarney"], 15],
  [["Coquitlam", "Port Moody", "New Westminster"], 12],
  [["Surrey Central", "Delta"], 10],
  [["North Vancouver", "West Vancouver"], 5],
].map(([names, w]) => [names.map(area), w]);

const CAMPUS_CHOICES = [
  [campusSpot("UBC Bus Exchange"), 70],
  [campusSpot("Nest"), 12],
  [campusSpot("Life Sciences"), 10],
  [campusSpot("Thunderbird"), 8],
];
const DAY_PATTERNS = [
  [[1, 3, 5], 30],
  [[2, 4], 20],
  [[1, 2, 3, 4, 5], 25],
  [[1, 3], 12],
  [[2, 3, 4], 13],
];
const ARRIVALS = [["08:00", 1], ["08:30", 4], ["09:00", 5], ["09:30", 4], ["10:00", 3], ["10:30", 1.5], ["11:00", 1]];

// --- Geometry -------------------------------------------------------------------------

const R = 6371;
const toRad = (d) => (d * Math.PI) / 180;
function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Point `km` away in a random direction.
function offset(p, km) {
  const bearing = rand() * 2 * Math.PI;
  const dLat = (km / R) * Math.cos(bearing);
  const dLng = ((km / R) * Math.sin(bearing)) / Math.cos(toRad(p.lat));
  return { lat: round6(p.lat + (dLat * 180) / Math.PI), lng: round6(p.lng + (dLng * 180) / Math.PI) };
}
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const jitterWithin = (p, maxKm) => offset(p, maxKm * Math.sqrt(rand()));
function nearestArea(p) {
  let best = { name: "Metro Vancouver", km: Infinity };
  for (const a of AREAS) {
    const km = haversineKm(p, a);
    if (km < best.km) best = { name: a.name, km };
  }
  return best.km <= 6 ? best.name : "Metro Vancouver";
}
function decodePolyline(str) {
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0, result = 0, b;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d;
      else lng += d;
    }
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}
// Point at fraction t (0 = start, 1 = end) of the path's length.
function pointAlong(path, t) {
  const segs = path.slice(1).map((p, i) => haversineKm(path[i], p));
  let target = segs.reduce((s, x) => s + x, 0) * t;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? Math.min(1, target / segs[i]) : 0;
      return { lat: path[i].lat + (path[i + 1].lat - path[i].lat) * f, lng: path[i].lng + (path[i + 1].lng - path[i].lng) * f };
    }
    target -= segs[i];
  }
  return path[path.length - 1];
}

// --- Time -----------------------------------------------------------------------------

const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function vancouverDate(offsetDays) {
  const d = new Date(Date.now() - offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function weekdayOf(date) {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
// Vancouver wall-clock time on a date → ISO timestamp.
function vancouverIso(date, minutes) {
  const guess = new Date(`${date}T${fromMin(minutes)}:00Z`);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/Vancouver", timeZoneName: "shortOffset" })
    .formatToParts(guess)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT-8";
  return new Date(guess.getTime() - Number(name.replace("GMT", "") || 0) * 3600000).toISOString();
}

// --- People ---------------------------------------------------------------------------

const FIRST = `Aiden Priya Wei Jun Mei Hiroshi Yuna Minji Seoyeon Arjun Ananya Rohan Simran Harpreet Gurpreet Jaspreet Mohammed Fatima Omar Layla Yusuf Amira Zainab Hassan Chloe Emma Olivia Liam Noah Ethan Lucas Mateo Sofia Isabella Camila Diego Valentina Gabriel Thanh Linh Minh Anh Nhi Tuan Kwame Amara Chidi Ngozi Tariq Leila Dariush Shirin Parisa Reza Nikolai Anya Mikhail Katya Luca Giulia Marco Elena Jonah Maya Noor Aisha Kai Leilani Tane Aroha Sipho Thandiwe Ines Tomas Pablo Lucia Sven Astrid Freya Oskar Ravi Deepa Kiran Nikhil Tenzin Pema Julien Amelie Hana Kenji Ryo Sakura Daniel Grace Joshua Hannah Samuel Zoe Isaac Leah Owen Nora Caleb Ava Ben Claire Mason Ruby Felix Iris`.split(" ");
const LAST = `Chen Wong Li Zhang Liu Huang Lam Ng Tan Kim Park Lee Choi Nguyen Tran Pham Le Sato Tanaka Suzuki Nakamura Sharma Patel Singh Gill Sandhu Dhillon Grewal Kaur Gupta Reddy Iyer Khan Ahmed Hussain Rahman Siddiqui Haddad Karimi Hosseini Ahmadi Rezaei Garcia Martinez Rodriguez Lopez Hernandez Silva Santos Costa Rossi Russo Bianchi Ivanova Petrov Smirnov Kowalski Nowak Okafor Mensah Adeyemi Osei Mwangi Dubois Tremblay Gagnon Roy Leblanc Smith Johnson Brown Wilson MacDonald Campbell Stewart Anderson Thompson Walker Murphy O'Brien Kelly Larsen Andersen Johansson Fischer Schmidt Muller Cohen Levi Friedman Yazzie Joe Paul Kapoor Mehta Joshi Bose`.split(" ");
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

function makeNames(n) {
  const seen = new Set();
  const out = [];
  while (out.length < n) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

const CARS = [
  ["Honda Civic", false, 10], ["Toyota Corolla", false, 10], ["Mazda3", false, 7], ["Toyota RAV4", false, 7],
  ["Hyundai Elantra", false, 6], ["Honda CR-V", false, 6], ["Subaru Crosstrek", false, 4], ["Kia Forte", false, 4],
  ["Volkswagen Jetta", false, 3], ["Toyota Camry", false, 3], ["Mazda CX-5", false, 4], ["Honda Fit", false, 2],
  ["Tesla Model 3", true, 6], ["Tesla Model Y", true, 4], ["Hyundai Ioniq 5", true, 3], ["Nissan Leaf", true, 2], ["Chevrolet Bolt EV", true, 2],
];
const COLOURS = ["White", "Black", "Grey", "Silver", "Blue", "Red", "Dark Green", "Navy"];
const LETTERS = "ABCDEFGHJKLMNPRSTVWXYZ";

// --- Google Directions (drivers only; the app reuses these) -------------------------

async function driveRoute(from, to) {
  const params = new URLSearchParams({ origin: `${from.lat},${from.lng}`, destination: `${to.lat},${to.lng}`, mode: "driving", key: MAPS_KEY });
  try {
    const body = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`).then((r) => r.json());
    if (body.status !== "OK") throw new Error(body.status);
    const route = body.routes[0];
    const seconds = route.legs.reduce((s, l) => s + l.duration.value, 0);
    return { polyline: route.overview_polyline.points, minutes: Math.round(seconds / 60) };
  } catch (e) {
    console.warn(`  Directions failed (${e.message}); using a straight-line estimate`);
    return { polyline: null, minutes: Math.round(((haversineKm(from, to) * 1.35) / 35) * 60) };
  }
}
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }));
  return out;
}

// --- Steps ----------------------------------------------------------------------------

async function checkServer() {
  try {
    await request("GET", `${APP_URL}/`, null, 10000);
  } catch {
    fail(`Can't reach ${APP_URL}. Start the app with \`npm run dev\` first (the pod rebuild runs there).`);
  }
}

async function cleanup() {
  // Explicit ranges first, then users (which cascades profiles, vehicles, pods, members, messages, trips, ratings).
  for (const [table, p] of [["ratings", RANGE.ratings], ["pod_messages", RANGE.messages], ["pod_trips", RANGE.trips], ["vehicles", RANGE.vehicles]]) {
    await must(db.from(table).delete().gte("id", lo(p)).lt("id", next(p)), `clean ${table}`);
  }
  const { count } = await db.from("users").select("id", { count: "exact", head: true }).gte("id", lo(RANGE.users)).lt("id", next(RANGE.users));
  await must(db.from("users").delete().gte("id", lo(RANGE.users)).lt("id", next(RANGE.users)), "clean users");
  console.log(`1. Cleanup: removed ${count ?? 0} previous seed users (and everything attached).`);
}

function buildPeople() {
  const names = makeNames(DRIVERS + RIDERS);
  const usedEmails = new Set();
  return names.map((full_name, i) => {
    const [first, ...rest] = full_name.split(" ");
    let email = `${slug(first)}.${slug(rest.join(""))}@demo.hoppedin.test`;
    for (let k = 2; usedEmails.has(email); k++) email = `${slug(first)}.${slug(rest.join(""))}${k}@demo.hoppedin.test`;
    usedEmails.add(email);
    const driver = i < DRIVERS;
    return {
      id: uuid(RANGE.users, i + 1),
      ubc_email: email,
      email_verified: true,
      full_name,
      faculty: pick(FACULTIES),
      year: 1 + Math.floor(rand() * 5),
      photo_url: chance(0.7) ? `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(full_name)}` : null,
      role: "both",
      rating_avg: Math.round(between(4.4, 5.0) * 100) / 100,
      rating_count: 3 + Math.floor(rand() * 58),
      chat_preference: pick(["chatty", "quiet", "no_preference"]),
      license_verified: driver ? chance(0.85) : false,
      _driver: driver,
    };
  });
}

function randomHome() {
  const centres = weighted(REGIONS);
  return jitterWithin(pick(centres), 1.2);
}

async function buildDrivers(people) {
  const drivers = people.filter((p) => p._driver).map((u) => {
    const home = randomHome();
    const campus = weighted(CAMPUS_CHOICES);
    const days = weighted(DAY_PATTERNS);
    const arrive_by = weighted(ARRIVALS);
    // A few drivers start later on one day (e.g. a Wednesday lab).
    const day_times = chance(0.12) ? { [String(pick(days))]: fromMin(Math.min(toMin(arrive_by) + 60, 11 * 60 + 30)) } : {};
    return { u, home, campus, days, arrive_by, day_times, seats: 2 + Math.floor(rand() * 3) };
  });
  console.log(`   Fetching ${drivers.length} driving routes from Google…`);
  const routes = await mapLimit(drivers, 5, (d) => driveRoute(d.home, d.campus));
  drivers.forEach((d, i) => {
    d.route = routes[i];
    d.path = routes[i].polyline ? decodePolyline(routes[i].polyline) : [d.home, d.campus];
  });
  return drivers;
}

// Rider schedule that overlaps the driver's and arrives 0-15 min after them.
function riderScheduleFor(d) {
  const subsets = { "1,3,5": [[1, 3, 5], [1, 3]], "2,4": [[2, 4]], "1,2,3,4,5": [[1, 2, 3, 4, 5], [1, 3, 5], [2, 4], [1, 3], [2, 3, 4]], "1,3": [[1, 3]], "2,3,4": [[2, 3, 4], [2, 4]] };
  const days = chance(0.6) ? d.days : pick(subsets[d.days.join(",")] ?? [d.days]);
  const gap = pick([0, 5, 10, 15]);
  const day_times = Object.fromEntries(Object.entries(d.day_times).filter(([k]) => days.includes(Number(k))).map(([k, t]) => [k, fromMin(toMin(t) + gap)]));
  return { days, arrive_by: fromMin(toMin(d.arrive_by) + gap), day_times };
}

function buildRiders(people, drivers) {
  const riders = people.filter((p) => !p._driver);
  const routeCount = Math.round(riders.length * ROUTE_RIDER_SHARE);
  // Spread route-based riders round-robin over drivers, never more than a driver's seats.
  const load = new Map(drivers.map((d) => [d.u.id, 0]));
  const order = shuffle(drivers);
  const hosts = [];
  for (let k = 0; hosts.length < routeCount && k < 50; k++) {
    for (const d of order) {
      if (hosts.length >= routeCount) break;
      if (load.get(d.u.id) < d.seats && (k === 0 || chance(0.7))) {
        load.set(d.u.id, load.get(d.u.id) + 1);
        hosts.push(d);
      }
    }
  }
  return riders.map((u, i) => {
    const d = hosts[i];
    if (d) {
      const onRoute = pointAlong(d.path, between(0.05, 0.65));
      return { u, home: offset(onRoute, between(0.3, 1.5)), campus: d.campus, seats: 1, ...riderScheduleFor(d) };
    }
    const arrive_by = weighted(ARRIVALS);
    return { u, home: randomHome(), campus: weighted(CAMPUS_CHOICES), days: weighted(DAY_PATTERNS), arrive_by, day_times: {}, seats: 1 };
  });
}

async function insertAll(people, drivers, riders) {
  const users = people.map(({ _driver, ...u }) => u);
  await must(db.from("users").insert(users), "insert users");

  const profile = (x, mode) => ({
    user_id: x.u.id,
    mode,
    home_lat: x.home.lat,
    home_lng: x.home.lng,
    home_area: nearestArea(x.home),
    campus_lat: x.campus.lat,
    campus_lng: x.campus.lng,
    campus_label: x.campus.label,
    days: x.days,
    arrive_by: x.arrive_by,
    day_times: x.day_times,
    seats: x.seats,
    active: true,
    route_polyline: mode === "driver" ? x.route.polyline : null,
    route_minutes: mode === "driver" ? x.route.minutes : null,
  });
  await must(db.from("commute_profiles").insert([...drivers.map((d) => profile(d, "driver")), ...riders.map((r) => profile(r, "rider"))]), "insert commute_profiles");

  const plates = new Set();
  const vehicles = drivers.map((d, i) => {
    const ev = chance(0.2);
    const [make_model] = weighted(CARS.filter(([, isEv]) => isEv === ev).map((c) => [c, c[2]]));
    let plate;
    do plate = `${pick(LETTERS)}${pick(LETTERS)}${Math.floor(rand() * 10)} ${Math.floor(rand() * 10)}${Math.floor(rand() * 10)}${pick(LETTERS)}`;
    while (plates.has(plate));
    plates.add(plate);
    return { id: uuid(RANGE.vehicles, i + 1), user_id: d.u.id, make_model, license_plate: plate, province: "BC", color: pick(COLOURS), seat_capacity: d.seats, is_ev: ev, photo_url: null };
  });
  await must(db.from("vehicles").insert(vehicles), "insert vehicles");
  console.log(`2-5. Inserted ${users.length} users (${drivers.length} drivers, ${riders.length} riders), commute profiles and ${vehicles.length} vehicles.`);
}

async function rebuild() {
  console.log("6. Running the real matching engine (POST /api/admin/pods/rebuild). This takes a few minutes…");
  const started = Date.now();
  const res = await request("POST", `${APP_URL}/api/admin/pods/rebuild`, { Authorization: `Bearer ${CRON_SECRET}` }, 20 * 60 * 1000);
  if (res.status !== 200) fail(`Rebuild failed (${res.status}): ${res.body.slice(0, 300)}`);
  const body = JSON.parse(res.body);
  console.log(`   Done in ${Math.round((Date.now() - started) / 1000)}s: ${JSON.stringify(body)}`);
  return body;
}

// --- Step 7: make pods feel lived-in ----------------------------------------------------

const DRIVER_LINES = [
  "Morning all, leaving now. See you at {pickup} around {time}.",
  "Running 2 min late, sorry",
  "Anyone want coffee? Stopping on the way in",
  "Traffic on the bridge is slow this morning, might be 5 min behind",
  "Made it, parked. Have a good day everyone",
  "Heads up, no class for me Friday so no ride that day",
  "Leaving in 5",
  "Just so you know, I'll be at the usual spot a couple minutes early tomorrow",
  "Great ride today, thanks for being on time everyone",
];
const RIDER_LINES = [
  "See you at {time}",
  "I'll be at the pickup spot in 2",
  "Running a couple min late, be there by {time}",
  "Thanks for the ride today!",
  "Good luck on midterms everyone",
  "Could we leave 5 min earlier next week? I have an early lab",
  "Yes please, a medium coffee would be amazing",
  "Out sick today, sorry for the late notice",
  "Here, by the bus stop",
  "Sounds good",
  "Does anyone know if the parking lot by the Nest is open this week?",
  "Thanks for waiting for me this morning",
];
const DRIVER_REVIEWS = ["Always on time and a smooth driver", "Super friendly, great chat on the way in", "Reliable and easy pickup", "Quiet ride, exactly what I wanted", "Waited for me when I was a minute late, appreciated", "Clean car and good music", "Best way to get to campus"];
const RIDER_REVIEWS = ["Always ready at the pickup spot", "Great company on the drive", "On time every day", "Easy to coordinate with", "Friendly and respectful"];

async function liven(seedIds) {
  const { data: pods } = await db.from("pods").select("id, driver_id").eq("status", "active").in("driver_id", seedIds);
  const podIds = (pods ?? []).map((p) => p.id);
  if (!podIds.length) return { pods: 0, messages: 0, trips: 0, ratings: 0 };
  const { data: members } = await db
    .from("pod_members")
    .select("pod_id, user_id, role, status, days, pickup_label, pickup_time, user:users!pod_members_user_id_fkey(full_name)")
    .in("pod_id", podIds)
    .eq("status", "active");

  let m = 0, t = 0, r = 0;
  const messages = [], trips = [], ratings = [], systemBackdates = [];
  for (const pod of pods) {
    const crew = (members ?? []).filter((x) => x.pod_id === pod.id);
    const driver = crew.find((x) => x.role === "driver");
    const riders = crew.filter((x) => x.role === "rider");
    if (!driver || !riders.length) continue;
    systemBackdates.push(pod.id);

    // Commute days in the last two weeks (not today).
    const days = [];
    for (let back = 1; back <= 14; back++) {
      const date = vancouverDate(back);
      if (driver.days.includes(weekdayOf(date))) days.push({ date, back });
    }

    // Chat: 3-8 messages over the past ~10 days, oldest first.
    const recent = days.filter((d) => d.back <= 10);
    const count = 3 + Math.floor(rand() * 6);
    const slots = Array.from({ length: count }, () => {
      const day = recent.length ? pick(recent) : { date: vancouverDate(1 + Math.floor(rand() * 10)) };
      return vancouverIso(day.date, 7 * 60 + Math.floor(rand() * 150));
    }).sort();
    const usedDriver = new Set(), usedRider = new Set();
    for (const created_at of slots) {
      const author = chance(0.4) ? driver : pick(riders);
      const isDriver = author.role === "driver";
      const pool = isDriver ? DRIVER_LINES : RIDER_LINES;
      const used = isDriver ? usedDriver : usedRider;
      const line = shuffle(pool).find((l) => !used.has(l)) ?? pick(pool);
      used.add(line);
      const ref = isDriver ? pick(riders) : author;
      const body = line
        .replace("{pickup}", (ref.pickup_label ?? "the usual spot").split(" · ")[0])
        .replace("{time}", prettyTime(ref.pickup_time) || "the usual time");
      messages.push({ id: uuid(RANGE.messages, ++m), pod_id: pod.id, user_id: author.user_id, kind: "user", body, created_at });
    }

    // Trip history: completed, ~5% missed (so the driver shows "Showed up 11/12").
    for (const { date } of days) {
      const missed = chance(0.05);
      trips.push({
        id: uuid(RANGE.trips, ++t),
        pod_id: pod.id,
        trip_date: date,
        status: missed ? "missed" : "completed",
        confirmed_at: missed ? null : vancouverIso(date, 7 * 60), // driver confirmed that morning
        created_at: vancouverIso(date, 6 * 60),
      });
    }

    // Ratings between members, mostly 4-5 stars.
    const score = () => weighted([[5, 70], [4, 25], [3, 5]]);
    const when = () => vancouverIso(vancouverDate(1 + Math.floor(rand() * 13)), 18 * 60 + Math.floor(rand() * 180));
    for (const rider of riders) {
      if (chance(0.85)) ratings.push({ id: uuid(RANGE.ratings, ++r), ride_id: null, rater_id: rider.user_id, ratee_id: driver.user_id, score: score(), comment: pick(DRIVER_REVIEWS), created_at: when() });
      if (chance(0.6)) ratings.push({ id: uuid(RANGE.ratings, ++r), ride_id: null, rater_id: driver.user_id, ratee_id: rider.user_id, score: score(), comment: pick(RIDER_REVIEWS), created_at: when() });
    }
  }

  // "X joined the pod" system messages from the rebuild predate the chat history.
  const joinedAt = vancouverIso(vancouverDate(12), 20 * 60);
  if (systemBackdates.length) await must(db.from("pod_messages").update({ created_at: joinedAt }).eq("kind", "system").in("pod_id", systemBackdates), "backdate system messages");
  for (const [table, rows] of [["pod_messages", messages], ["pod_trips", trips], ["ratings", ratings]]) {
    for (let i = 0; i < rows.length; i += 500) await must(db.from(table).insert(rows.slice(i, i + 500)), `insert ${table}`);
  }
  console.log(`7. Lived-in: ${messages.length} chat messages, ${trips.length} past trips, ${ratings.length} ratings across ${systemBackdates.length} pods.`);
  return { messages: messages.length, trips: trips.length, ratings: ratings.length };
}

function prettyTime(t) {
  if (!t) return "";
  const mins = toMin(t);
  const h = Math.floor(mins / 60), mm = mins % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")}`;
}

async function summary(people) {
  const seedIds = people.map((p) => p.id);
  const riderIds = people.filter((p) => !p._driver).map((p) => p.id);
  const driverIds = people.filter((p) => p._driver).map((p) => p.id);
  const { data: pods } = await db.from("pods").select("id").eq("status", "active").in("driver_id", driverIds);
  const podIds = (pods ?? []).map((p) => p.id);
  const { data: riderRows } = podIds.length
    ? await db.from("pod_members").select("pod_id, user_id").in("pod_id", podIds).eq("role", "rider").eq("status", "active")
    : { data: [] };
  const { data: anyActive } = await db.from("pod_members").select("user_id").in("user_id", riderIds).eq("role", "rider").eq("status", "active");
  const matched = new Set((anyActive ?? []).map((x) => x.user_id)).size;
  const withRiders = new Set((riderRows ?? []).map((x) => x.pod_id)).size;
  const avg = withRiders ? (riderRows.length / withRiders).toFixed(1) : "0";

  console.log("\n8. Summary");
  console.log(`   users            ${seedIds.length}`);
  console.log(`   drivers          ${driverIds.length}`);
  console.log(`   riders           ${riderIds.length}`);
  console.log(`   pods             ${withRiders} with riders (${podIds.length} seed-driver pods total)`);
  console.log(`   riders matched   ${matched}/${riderIds.length} (${Math.round((matched / riderIds.length) * 100)}%)`);
  console.log(`   avg riders/pod   ${avg}`);
  const ok = withRiders >= 25 && matched / riderIds.length >= 0.7;
  console.log(ok ? "   Target met (25+ pods, 70%+ riders matched)." : "   Below target (25+ pods, 70%+ riders matched).");
}

// --- Helpers ----------------------------------------------------------------------------

async function must(promise, what) {
  const { error, data } = await promise;
  if (error) fail(`${what}: ${error.message}`);
  return data;
}
function fail(msg) {
  console.error(`\nseed-pods: ${msg}`);
  process.exit(1);
}
// Plain http(s) request with a long timeout (the rebuild can outlast fetch's default).
function request(method, url, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = (u.protocol === "https:" ? https : http).request(u, { method, headers: { ...headers, "Content-Length": 0 } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

// --- Run --------------------------------------------------------------------------------

await checkServer();
await cleanup();
const people = buildPeople();
const drivers = await buildDrivers(people);
const riders = buildRiders(people, drivers);
await insertAll(people, drivers, riders);
await rebuild();
await liven(people.map((p) => p.id));
await summary(people);
process.exit(0);
