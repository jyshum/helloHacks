// Demo pods around one rider's schedule (Mon/Wed 7:45, Tue/Thu 9:15, Fri 9:45), covering the edge cases:
// a perfect match, a day that's too late, a slightly-early driver, per-day times, one day only.
// Run: node --env-file=.env.local scripts/seed-edge-pods.mjs   (safe to re-run)
// Uses its own ID range (5eed9xxx) so it never touches other seed data or real users.
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const KEY = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const CAMPUS = { lat: 49.2677, lng: -123.247, label: "UBC Bus Exchange" };
const RANGE_LO = "5eed9000-0000-0000-0000-000000000000";
const RANGE_HI = "5eed9100-0000-0000-0000-000000000000";
const id = (group, n) => `5eed9${group}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const avatar = (name) => `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name)}`;
const must = ({ error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

async function directions(from, to, via) {
  const p = new URLSearchParams({ origin: `${from.lat},${from.lng}`, destination: `${to.lat},${to.lng}`, mode: "driving", key: KEY });
  if (via) p.set("waypoints", `${via.lat},${via.lng}`);
  const b = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${p}`).then((r) => r.json());
  if (b.status !== "OK") throw new Error(`Directions ${b.status}`);
  const r = b.routes[0];
  return { polyline: r.overview_polyline.points, minutes: Math.round(r.legs.reduce((s, l) => s + l.duration.value, 0) / 60) };
}
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// ---- The pods --------------------------------------------------------------------------
const PODS = [
  {
    key: "perfect",
    driver: { name: "Maya Chen", faculty: "Applied Science", year: 4, home: { lat: 49.249, lng: -123.1005 }, area: "Kensington" },
    car: { make_model: "Toyota Prius", color: "Silver", plate: "RX4 21M", is_ev: false },
    days: [1, 2, 3, 4, 5], arrive_by: "07:45", day_times: { 2: "09:15", 4: "09:15", 5: "09:45" }, seats: 4,
    riders: [
      { name: "Hana Sato", faculty: "Science", year: 2, home: { lat: 49.2489, lng: -123.1152 }, area: "Riley Park", days: [1, 2, 3, 4, 5] },
      { name: "Leo Martins", faculty: "Arts", year: 3, home: { lat: 49.2489, lng: -123.1285 }, area: "Shaughnessy", days: [2, 4] },
    ],
    trips: { completed: 14, missed: 0 },
  },
  {
    key: "monwed",
    driver: { name: "Ethan Park", faculty: "Sauder School of Business", year: 3, home: { lat: 49.2335, lng: -123.1165 }, area: "Oakridge" },
    car: { make_model: "Honda Civic", color: "Blue", plate: "KP8 33T", is_ev: false },
    days: [1, 3, 5], arrive_by: "07:40", day_times: { 5: "10:00" }, seats: 3,
    riders: [{ name: "Aria Singh", faculty: "Science", year: 1, home: { lat: 49.2409, lng: -123.1298 }, area: "Shaughnessy", days: [1, 3, 5] }],
    trips: { completed: 9, missed: 1 },
  },
  {
    key: "tuethu",
    driver: { name: "Zoe Tremblay", faculty: "Kinesiology", year: 2, home: { lat: 49.2445, lng: -123.0755 }, area: "Kensington" },
    car: { make_model: "Mazda CX-5", color: "Red", plate: "MV2 90L", is_ev: false },
    days: [2, 4], arrive_by: "09:00", day_times: {}, seats: 4,
    riders: [
      { name: "Kai Morgan", faculty: "Forestry", year: 3, home: { lat: 49.2461, lng: -123.1003 }, area: "Riley Park", days: [2, 4] },
      { name: "Priya Das", faculty: "Science", year: 4, home: { lat: 49.2458, lng: -123.1231 }, area: "Oakridge", days: [2] },
    ],
    trips: { completed: 7, missed: 0 },
  },
  {
    key: "varies",
    driver: { name: "Omar Haddad", faculty: "Science", year: 5, home: { lat: 49.2412, lng: -123.1148 }, area: "South Cambie" },
    car: { make_model: "Tesla Model 3", color: "White", plate: "EV7 12Q", is_ev: true },
    days: [1, 3, 5], arrive_by: "07:40", day_times: { 3: "07:30", 5: "09:45" }, seats: 3,
    riders: [{ name: "Chloe Wong", faculty: "Land and Food Systems", year: 2, home: { lat: 49.2441, lng: -123.1227 }, area: "Shaughnessy", days: [1, 5] }],
    trips: { completed: 11, missed: 1 },
  },
  {
    key: "friday",
    driver: { name: "Lily Nguyen", faculty: "Arts", year: 3, home: { lat: 49.2512, lng: -123.1101 }, area: "Riley Park" },
    car: { make_model: "Hyundai Kona", color: "Green", plate: "LN5 48B", is_ev: true },
    days: [5], arrive_by: "09:30", day_times: {}, seats: 3,
    riders: [],
    trips: { completed: 3, missed: 0 },
  },
];

// Riders with no pod yet, along the Shaughnessy → UBC route, so a new driver has riders to add.
// Times are set against the same schedule: some fit every day, some only a few days.
const OPEN_RIDERS = [
  { name: "Noah Kim", faculty: "Science", year: 2, home: { lat: 49.2525, lng: -123.153 }, area: "Arbutus Ridge", days: [1, 2, 3, 4, 5], arrive_by: "07:50", day_times: { 2: "09:30", 4: "09:30", 5: "10:00" } },
  { name: "Sofia Rossi", faculty: "Arts", year: 3, home: { lat: 49.2575, lng: -123.168 }, area: "Kitsilano", days: [1, 3, 5], arrive_by: "08:00", day_times: { 5: "10:00" } },
  { name: "Liam O'Brien", faculty: "Applied Science", year: 1, home: { lat: 49.256, lng: -123.185 }, area: "Dunbar", days: [2, 4], arrive_by: "09:20", day_times: {} },
  { name: "Emma Zhou", faculty: "Sauder School of Business", year: 4, home: { lat: 49.249, lng: -123.142 }, area: "Shaughnessy", days: [1, 2, 3, 4, 5], arrive_by: "07:50", day_times: {} },
];

const CHAT = ["Morning! Leaving in 5", "Running 2 min late, sorry", "See you at the usual spot", "Anyone need a coffee stop?", "Thanks for the ride today", "Exam week, might skip Friday"];

async function main() {
  // Clean up a previous run (cascades pods, members, trips, chat, cars, ratings, profiles).
  must(await db.from("users").delete().gte("id", RANGE_LO).lt("id", RANGE_HI), "cleanup");

  let u = 0, v = 0, t = 0, r = 0, m = 0;
  for (const [pi, spec] of PODS.entries()) {
    const d = spec.driver;
    const driverId = id("000", ++u);
    const slug = d.name.toLowerCase().replace(/\W+/g, ".");
    must(await db.from("users").insert({
      id: driverId, ubc_email: `${slug}@demo.hoppedin.test`, email_verified: true, full_name: d.name, faculty: d.faculty, year: d.year,
      photo_url: avatar(d.name), role: "both", rating_avg: 4.8, rating_count: 20 + pi * 3, license_verified: true, chat_preference: "no_preference",
    }), "driver user");

    const route = await directions(d.home, CAMPUS);
    must(await db.from("commute_profiles").insert({
      user_id: driverId, mode: "driver", home_lat: d.home.lat, home_lng: d.home.lng, home_area: d.area,
      campus_lat: CAMPUS.lat, campus_lng: CAMPUS.lng, campus_label: CAMPUS.label,
      days: spec.days, arrive_by: spec.arrive_by, day_times: spec.day_times, seats: spec.seats, home_leave_at: "16:30",
      route_polyline: route.polyline, route_minutes: route.minutes, active: true,
    }), "driver profile");
    must(await db.from("vehicles").insert({
      id: id("100", ++v), user_id: driverId, make_model: spec.car.make_model, license_plate: spec.car.plate, province: "BC",
      color: spec.car.color, seat_capacity: spec.seats, is_ev: spec.car.is_ev,
    }), "vehicle");

    const { data: pod, error: pe } = await db.from("pods").insert({ driver_id: driverId, campus_lat: CAMPUS.lat, campus_lng: CAMPUS.lng, campus_label: CAMPUS.label }).select("id").single();
    if (pe) throw pe;
    must(await db.from("pod_members").insert({ pod_id: pod.id, user_id: driverId, role: "driver", status: "active", days: spec.days }), "driver member");

    const riderIds = [];
    for (const rs of spec.riders) {
      const rid = id("000", ++u);
      riderIds.push(rid);
      const rslug = rs.name.toLowerCase().replace(/\W+/g, ".");
      must(await db.from("users").insert({
        id: rid, ubc_email: `${rslug}@demo.hoppedin.test`, email_verified: true, full_name: rs.name, faculty: rs.faculty, year: rs.year,
        photo_url: avatar(rs.name), role: "both", rating_avg: 4.9, rating_count: 6, chat_preference: "chatty",
      }), "rider user");
      const firstDay = rs.days[0];
      const arrive = spec.day_times[firstDay] ?? spec.arrive_by;
      must(await db.from("commute_profiles").insert({
        user_id: rid, mode: "rider", home_lat: rs.home.lat, home_lng: rs.home.lng, home_area: rs.area,
        campus_lat: CAMPUS.lat, campus_lng: CAMPUS.lng, campus_label: CAMPUS.label, days: rs.days, arrive_by: arrive, day_times: {}, active: true,
      }), "rider profile");
      const ride = await directions(rs.home, CAMPUS);
      const withStop = await directions(d.home, CAMPUS, rs.home);
      const pickup = fromMin(Math.floor((toMin(arrive) - ride.minutes - 5) / 5) * 5);
      must(await db.from("pod_members").insert({
        pod_id: pod.id, user_id: rid, role: "rider", status: "active", days: rs.days,
        pickup_lat: rs.home.lat, pickup_lng: rs.home.lng, pickup_label: `Near home · ${rs.area}`, pickup_time: pickup,
        detour_minutes: Math.max(1, withStop.minutes - route.minutes), drive_minutes: ride.minutes, transit_minutes: ride.minutes + 18, score: 30,
      }), "rider member");
    }

    // History: past commute days so the driver shows "showed up N/M", plus a little chat.
    const today = new Date();
    const past = [];
    for (let back = 1; past.length < spec.trips.completed + spec.trips.missed && back < 60; back++) {
      const dt = new Date(today.getTime() - back * 86400000);
      const wd = dt.getUTCDay();
      if (spec.days.includes(wd)) past.push(dt.toISOString().slice(0, 10));
    }
    must(await db.from("pod_trips").insert(past.map((date, i) => ({ id: id("200", ++t), pod_id: pod.id, trip_date: date, status: i < spec.trips.missed ? "missed" : "completed" }))), "trips");
    if (riderIds.length) {
      const people = [driverId, ...riderIds];
      must(await db.from("pod_messages").insert(CHAT.slice(0, 3 + pi % 3).map((body, i) => ({
        id: id("400", ++m), pod_id: pod.id, user_id: people[i % people.length], kind: "user", body,
        created_at: new Date(today.getTime() - (5 - i) * 86400000).toISOString(),
      }))), "chat");
      must(await db.from("ratings").insert(riderIds.map((rid) => ({ id: id("300", ++r), ride_id: null, rater_id: rid, ratee_id: driverId, score: 5, comment: "Always on time, easy pickup." }))), "ratings");
    }
    console.log(`✓ ${spec.key.padEnd(8)} ${d.name} · days ${spec.days.join("")} · ${spec.arrive_by}${Object.keys(spec.day_times).length ? " (varies)" : ""} · ${spec.riders.length} riders · pod ${pod.id}`);
  }
  for (const rs of OPEN_RIDERS) {
    const rid = id("000", ++u);
    must(await db.from("users").insert({
      id: rid, ubc_email: `${rs.name.toLowerCase().replace(/\W+/g, ".")}@demo.hoppedin.test`, email_verified: true, full_name: rs.name, faculty: rs.faculty, year: rs.year,
      photo_url: avatar(rs.name), role: "both", rating_avg: 4.9, rating_count: 4, chat_preference: "no_preference",
    }), "open rider user");
    must(await db.from("commute_profiles").insert({
      user_id: rid, mode: "rider", home_lat: rs.home.lat, home_lng: rs.home.lng, home_area: rs.area,
      campus_lat: CAMPUS.lat, campus_lng: CAMPUS.lng, campus_label: CAMPUS.label, days: rs.days, arrive_by: rs.arrive_by, day_times: rs.day_times, active: true,
    }), "open rider profile");
    console.log(`✓ open     ${rs.name} · ${rs.area} · days ${rs.days.join("")}`);
  }
  console.log(`Done: ${PODS.length} pods, ${OPEN_RIDERS.length} riders without a pod, ${u} people.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
