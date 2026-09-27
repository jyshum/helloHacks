// Records the product demo: two phones (driver + rider) going through the real app,
// from the landing page to arriving on campus. Everything runs on real app logic; only
// three things are stood in for, and only in this local run:
//   1. the verification email (we open the same link the email would contain),
//   2. the clock (DEMO_CLOCK_OFFSET_MS makes it Monday 6:50am),
//   3. GPS (the driver's browser is fed points along the real route).
// Output: out/demo/{driver,rider}.mp4 (full phone resolution, both on one clock) + out/demo/cues.json.
//
// Needs: `npm run build` first. Run: node --env-file=.env.local scripts/demo/record.mjs
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const OUT = new URL("../../out/demo/", import.meta.url).pathname;
const BASE = "http://localhost:3000";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const KEY = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const PEOPLE = {
  driver: { name: "Alex Rivera", email: "alexrivera.hoppedin.demo@student.ubc.ca", faculty: "Applied Science", year: "3", place: "Queen Elizabeth Park", time: "08:00", car: { make: "Honda Civic", color: "White", plate: "DEMO 01" } },
  rider: { name: "Sam Lee", email: "samlee.hoppedin.demo@student.ubc.ca", faculty: "Applied Science", year: "2", place: "Douglas Park Vancouver", time: "08:15" },
};
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Moments, timed against each phone's own video ---------------------------------
const cues = [];
const born = {};
function mark(who, name) {
  const t = (Date.now() - born[who]) / 1000;
  cues.push({ who, name, t: Math.round(t * 100) / 100 });
  console.log(`  ${who.padEnd(6)} ${t.toFixed(1).padStart(6)}s  ${name}`);
}

// ---- Helpers ---------------------------------------------------------------------------
async function tap(page, locator, pause = 350) {
  const el = typeof locator === "string" ? page.locator(locator) : locator;
  await el.first().waitFor({ state: "visible", timeout: 30000 });
  await el.first().scrollIntoViewIfNeeded();
  await sleep(pause);
  await el.first().click();
}
async function type(page, selector, text) {
  await tap(page, selector, 200);
  await page.locator(selector).first().pressSequentially(text, { delay: 55 });
}
const byText = (page, text) => page.getByText(text, { exact: true });

async function cleanup() {
  for (const p of Object.values(PEOPLE)) {
    const { data: u } = await db.from("users").select("id, auth_id").eq("ubc_email", p.email).maybeSingle();
    if (u) {
      await db.from("pods").delete().eq("driver_id", u.id);
      await db.from("users").delete().eq("id", u.id);
    }
    const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
    const a = list?.users.find((x) => x.email === p.email);
    if (a) await db.auth.admin.deleteUser(a.id);
  }
}

// Real people must never be pulled into the demo. A real rider could be auto-invited by the
// demo driver, and a real driver could show up in the demo rider's options. Both need the
// driver to arrive 0-20 min before the rider on a shared day, so check exactly that.
async function safetyCheck() {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const at = (p, d) => toMin(p.day_times?.[d] ?? p.arrive_by);
  const { data } = await db.from("commute_profiles").select("mode, days, arrive_by, day_times, user:users!commute_profiles_user_id_fkey(auth_id, full_name, ubc_email)").eq("active", true);
  const real = (data ?? []).filter((r) => r.user?.auth_id && !Object.values(PEOPLE).some((p) => p.email === r.user.ubc_email));
  const fits = (driverTime, rider) => rider.days.some((d) => { const g = at(rider, d) - driverTime; return g >= 0 && g <= 20; });
  const risky = real.filter((r) =>
    r.mode === "rider" ? fits(toMin(PEOPLE.driver.time), r) : r.days.some((d) => { const g = toMin(PEOPLE.rider.time) - at(r, d); return g >= 0 && g <= 20; })
  );
  if (risky.length) throw new Error(`Stopping: ${risky.map((r) => r.user.full_name).join(", ")} could match the demo people. Change their times or reset them first.`);
  if (real.length) console.log(`Safety: ${real.map((r) => r.user.full_name).join(", ")} active, but their times can't match the demo. OK.`);
}

// Monday 6:50am Vancouver: the next Monday (or today, if it's Monday before 6:50).
function mondayOffset() {
  const now = new Date();
  const v = new Date(now.toLocaleString("en-US", { timeZone: "America/Vancouver" }));
  const target = new Date(v);
  target.setHours(6, 50, 0, 0);
  let add = (8 - v.getDay()) % 7;
  if (add === 0 && v > target) add = 7;
  target.setDate(target.getDate() + add);
  return target.getTime() - v.getTime();
}

function startServer(offset) {
  const srv = spawn("npx", ["next", "start", "-p", "3000"], {
    env: { ...process.env, DEMO_RECORDING: "1", DEMO_CLOCK_OFFSET_MS: String(offset) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  srv.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
  return new Promise((resolve) => srv.stdout.on("data", (d) => String(d).includes("Ready") && resolve(srv)));
}

function decode(str) {
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let b, shift = 0, res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}
const km = (a, b) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
// Real driving route as evenly spaced points (~every `stepKm`).
async function route(from, to, stepKm = 0.045) {
  const p = new URLSearchParams({ origin: `${from.lat},${from.lng}`, destination: `${to.lat},${to.lng}`, mode: "driving", key: KEY });
  const b = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${p}`).then((r) => r.json());
  if (b.status !== "OK") throw new Error(`Directions: ${b.status}`);
  const raw = b.routes[0].legs.flatMap((l) => l.steps.flatMap((s) => decode(s.polyline.points)));
  const out = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    let last = out[out.length - 1];
    let d = km(last, raw[i]);
    while (d > stepKm) {
      const f = stepKm / d;
      last = { lat: last.lat + (raw[i].lat - last.lat) * f, lng: last.lng + (raw[i].lng - last.lng) * f };
      out.push(last);
      d = km(last, raw[i]);
    }
  }
  out.push(raw[raw.length - 1]);
  return out;
}
async function drive(ctx, points, everyMs, until) {
  for (const p of points) {
    await ctx.setGeolocation({ latitude: p.lat, longitude: p.lng, accuracy: 10 });
    await sleep(everyMs);
    if (until && (await until())) return;
  }
}

// ---- Capture ------------------------------------------------------------------------------
// Frames straight from the browser at full phone resolution, stamped on the shared clock (T0).
// The browser only sends a frame when the screen changes, so each frame lasts until the next.
const T0 = Date.now();
async function capture(ctx, page, who) {
  const dir = OUT + "raw/" + who + "/";
  mkdirSync(dir, { recursive: true });
  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
    const file = `${dir}${String(frames.length).padStart(6, "0")}.jpg`;
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: (Date.now() - T0) / 1000 });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1170, maxHeight: 2532, everyNthFrame: 1 });
  return frames;
}

// Frames → constant 30 fps video (every frame a keyframe, for exact seeking in the edit).
function toVideo(who, frames, endT) {
  if (!frames.length) return;
  const lines = ["ffconcat version 1.0"];
  frames.forEach((f, i) => {
    const start = i === 0 ? 0 : f.t;
    const next = i + 1 < frames.length ? frames[i + 1].t : endT;
    lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - start).toFixed(3)}`);
  });
  lines.push(`file '${frames[frames.length - 1].file}'`);
  writeFileSync(OUT + `raw/${who}.txt`, lines.join("\n"));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", OUT + `raw/${who}.txt`,
    "-vf", "fps=30,scale=780:1688:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-g", "1", "-crf", "15", OUT + who + ".mp4"]);
}

// ---- Scenes ------------------------------------------------------------------------------
async function signUp(page, who) {
  const p = PEOPLE[who];
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  mark(who, "landing");
  await sleep(1400);
  await tap(page, page.getByRole("link", { name: /Get started/ }));
  await page.waitForURL("**/signup");
  mark(who, "signup");
  await type(page, "#full_name", p.name);
  await type(page, "#email", p.email);
  await type(page, "#password", "demo-ride-2026");
  // Faculty + year: shown on your profile and pod cards, and same-faculty riders are highlighted.
  mark(who, "faculty_year");
  await sleep(400);
  await page.selectOption("#faculty", p.faculty);
  await sleep(700);
  await page.selectOption("#year", p.year);
  await sleep(700);
  const resp = page.waitForResponse((r) => r.url().includes("/api/signup"));
  await tap(page, page.getByRole("button", { name: "Continue" }));
  const { emailLink } = await (await resp).json();
  await page.waitForURL("**/verify**");
  mark(who, "check_inbox");
  // A face for the profile, like the seeded commuters have.
  await db.from("users").update({ photo_url: `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(p.name)}` }).eq("ubc_email", p.email);
  await sleep(1600);
  // The tap on the link in the verification email.
  await page.goto(BASE + emailLink);
  await page.waitForURL("**/commute**", { timeout: 30000 });
  mark(who, "verified");
}

async function pickHome(page, place) {
  await type(page, 'input[placeholder="Address or postal code"]', place);
  const first = page.locator("button.row").first();
  await first.waitFor({ timeout: 15000 });
  await sleep(500);
  await first.click();
  await page.getByText("Shown as").waitFor();
  await sleep(700);
}

async function schedule(page, time) {
  for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
    await tap(page, page.getByRole("button", { name: `${d} off` }), 180);
  }
  await page.selectOption('select[aria-label="Arrive by on Mon"]', time);
  await sleep(400);
  await tap(page, byText(page, "Same time every day"));
  await sleep(700);
}

async function onboardDriver(page) {
  const p = PEOPLE.driver;
  mark("driver", "onboarding");
  await tap(page, byText(page, "I drive"));
  await pickHome(page, p.place);
  await tap(page, page.getByRole("button", { name: "Continue" }));
  await schedule(page, p.time);
  mark("driver", "schedule_set");
  await tap(page, page.getByRole("button", { name: "Continue" }));
  await page.getByText("Heading home?").waitFor();
  mark("driver", "ride_home_step");
  await sleep(1400);
  await tap(page, page.getByRole("button", { name: "Continue" }));
  await sleep(600);
  await tap(page, page.getByRole("button", { name: "Continue" }));
  mark("driver", "car");
  await type(page, 'input[name="make_model"]', p.car.make);
  await type(page, 'input[name="color"]', p.car.color);
  await type(page, 'input[name="license_plate"]', p.car.plate);
  await page.setInputFiles('input[name="photo"]', new URL("../../out/demo/car.png", import.meta.url).pathname);
  await sleep(900);
  await tap(page, page.getByRole("button", { name: "Find riders" }));
  await page.waitForURL("**/pods/**", { timeout: 60000 });
  await page.getByText("Riders for you").waitFor({ timeout: 30000 });
  mark("driver", "pod_ready");
  await sleep(2500);
}

async function onboardRider(page) {
  const p = PEOPLE.rider;
  mark("rider", "onboarding");
  await tap(page, byText(page, "I need a ride"));
  await pickHome(page, p.place);
  await tap(page, page.getByRole("button", { name: "Continue" }));
  await schedule(page, p.time);
  mark("rider", "schedule_set");
  await tap(page, page.getByRole("button", { name: "Find pods" }));
  await page.waitForURL("**/pods", { timeout: 60000 });
  const card = page.locator('[role="button"]').filter({ hasText: "Alex" });
  await card.first().waitFor({ timeout: 60000 });
  mark("rider", "pods_for_you");
  await sleep(1500);
  await tap(page, card.first().locator("p").first());
  await page.getByText(/a ride$/).first().waitFor({ timeout: 30000 });
  mark("rider", "preview");
  await sleep(2500);
  await tap(page, page.getByText(/a ride$/).first());
  mark("rider", "fare_breakdown");
  await sleep(2200);
  await tap(page, page.getByRole("button", { name: "Join", exact: true }).last());
  const mine = page.getByText("Alex's pod");
  await mine.waitFor({ timeout: 30000 });
  mark("rider", "pending");
  await sleep(1300);
  await tap(page, mine);
  await page.getByText(/^Asked /).waitFor({ timeout: 30000 });
  mark("rider", "asked");
}

async function approve(driver, rider) {
  const btn = driver.getByRole("button", { name: "Approve" });
  await btn.waitFor({ timeout: 45000 });
  mark("driver", "request_arrives");
  await btn.scrollIntoViewIfNeeded();
  await sleep(1500);
  await btn.click();
  mark("driver", "approved");
  await rider.locator("h1").filter({ hasText: / by \d/ }).first().waitFor({ timeout: 45000 });
  mark("rider", "in_pod");
  await sleep(2500);
}

// Rider taps into Monday's ride home: route sheet, home-by time, "I'm in".
async function rideHome(rider) {
  const card = rider.locator(".card").filter({ hasText: /^Ride home/ }).first();
  await card.scrollIntoViewIfNeeded();
  await sleep(700);
  await card.locator("span").first().click();
  await rider.getByText(/^Home by /).waitFor({ timeout: 20000 });
  mark("rider", "ride_home_sheet");
  await sleep(2600);
  await tap(rider, rider.getByRole("button", { name: /^I'm in for / }));
  await rider.getByRole("button", { name: "Don't need a ride" }).last().waitFor({ timeout: 15000 });
  mark("rider", "ride_home_in");
  await sleep(1500);
  await tap(rider, rider.getByRole("button", { name: "Close" }).last());
  await sleep(800);
  await rider.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(600);
}

async function topUp(rider) {
  await tap(rider, rider.getByRole("button", { name: "Open menu" }));
  await tap(rider, rider.getByRole("link", { name: "Wallet" }));
  await rider.waitForURL("**/wallet");
  mark("rider", "wallet");
  await sleep(1500);
  await tap(rider, rider.getByRole("button", { name: "Add money" }));
  await sleep(900);
  await tap(rider, rider.getByRole("button", { name: /^Pay / }));
  mark("rider", "paying");
  await rider.getByText(/added$/).waitFor({ timeout: 15000 });
  mark("rider", "paid");
  await sleep(2200);
  await rider.goBack();
  await rider.waitForURL("**/pods/**");
}

async function trip(driverCtx, driver, rider, driverId, riderId, podId) {
  await driver.reload();
  await tap(driver, driver.getByRole("button", { name: "Start pickup" }));
  mark("driver", "start_pickup");
  await tap(driver, driver.getByRole("link", { name: "Open trip" }));
  await driver.waitForURL("**/match/**");
  await tap(rider, rider.getByRole("link", { name: "Track" }), 1200);
  await rider.waitForURL("**/match/**");
  mark("rider", "tracking");

  const [{ data: dp }, { data: m }, { data: pod }] = await Promise.all([
    db.from("commute_profiles").select("home_lat, home_lng").eq("user_id", driverId).single(),
    db.from("pod_members").select("pickup_lat, pickup_lng").eq("pod_id", podId).eq("user_id", riderId).single(),
    db.from("pods").select("campus_lat, campus_lng").eq("id", podId).single(),
  ]);
  const home = { lat: dp.home_lat, lng: dp.home_lng };
  const pickup = { lat: m.pickup_lat, lng: m.pickup_lng };
  const campus = { lat: pod.campus_lat, lng: pod.campus_lng };
  const leg1 = await route(home, pickup);
  const leg2 = await route(pickup, campus, 0.09);
  mark("driver", "driving");
  await drive(driverCtx, leg1, 260);
  await rider.getByText(/is here$/).waitFor({ timeout: 20000 });
  mark("rider", "driver_here");
  await sleep(2200);
  await tap(driver, driver.getByRole("button", { name: /^Picked up/ }));
  mark("driver", "picked_up");
  await sleep(1500);
  const arrived = async () => driver.url().includes("/complete");
  await drive(driverCtx, leg2, 220, arrived);
  await driver.waitForURL("**/complete**", { timeout: 30000 });
  mark("driver", "arrived");
  await driver.getByText(/You earned/).waitFor({ timeout: 15000 });
  await tap(rider, rider.getByRole("link", { name: /^Rate / }), 900);
  await rider.getByText(/Balance \$/).waitFor({ timeout: 20000 });
  mark("rider", "receipt");
  await sleep(3500);
}

// An illustrated car photo (no real car or plate) for the driver's onboarding.
async function makeCarPhoto(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.setContent(`<body style="margin:0;background:linear-gradient(180deg,#dfe9f5,#f4f7fb 60%,#cfd8e3 60%,#b9c4d1)">
  <svg viewBox="0 0 600 400" width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="300" cy="318" rx="240" ry="16" fill="#0b1b2e" opacity=".18"/>
    <path d="M70 280 q0-40 40-50 l60-14 q40-52 110-58 h90 q60 6 100 58 l40 8 q40 10 40 50 v18 H70z" fill="#fbfcfe" stroke="#c9d3df" stroke-width="3"/>
    <path d="M200 214 q34-42 86-46 h74 q44 4 76 46z" fill="#1d3557" opacity=".85"/>
    <line x1="330" y1="168" x2="330" y2="214" stroke="#fbfcfe" stroke-width="6"/>
    <rect x="252" y="262" width="96" height="30" rx="4" fill="#fff" stroke="#0b1b2e" stroke-width="3"/>
    <text x="300" y="284" font-family="Helvetica,Arial" font-weight="700" font-size="18" text-anchor="middle" fill="#0b1b2e">DEMO 01</text>
    <circle cx="160" cy="298" r="34" fill="#222"/><circle cx="160" cy="298" r="14" fill="#9aa5b1"/>
    <circle cx="440" cy="298" r="34" fill="#222"/><circle cx="440" cy="298" r="14" fill="#9aa5b1"/>
    <rect x="484" y="246" width="26" height="12" rx="4" fill="#ffd166"/><rect x="88" y="246" width="22" height="12" rx="4" fill="#ef476f"/>
  </svg></body>`);
  await page.screenshot({ path: OUT + "car.png" });
  await page.close();
}

// ---- Main -------------------------------------------------------------------------------
async function main() {
  rmSync(OUT + "raw", { recursive: true, force: true });
  mkdirSync(OUT + "raw", { recursive: true });
  await safetyCheck();
  await cleanup();
  const offset = mondayOffset();
  console.log(`Clock: Monday 6:50am (offset ${(offset / 3600000).toFixed(1)} h). Starting server…`);
  const srv = await startServer(offset);

  const browser = await chromium.launch({ headless: true });
  await makeCarPhoto(browser);
  const make = async (who, pos) => {
    const ctx = await browser.newContext({
      ...PHONE,
      timezoneId: "America/Vancouver",
      locale: "en-CA",
      geolocation: { latitude: pos.lat, longitude: pos.lng, accuracy: 10 },
      permissions: ["geolocation"],
    });
    const page = await ctx.newPage();
    page.on("console", (m) => ["error", "warning"].includes(m.type()) && process.env.DEBUG && console.log(`  [${who} console] ${m.text().slice(0, 200)}`));
    page.on("websocket", (ws) => process.env.DEBUG && ws.on("framereceived", (f) => String(f.payload).includes("presence") && console.log(`  [${who} ws] ${String(f.payload).slice(0, 160)}`)));
    return { ctx, page, frames: await capture(ctx, page, who) };
  };
  const D = await make("driver", { lat: 49.2418, lng: -123.1127 });
  const R = await make("rider", { lat: 49.2539, lng: -123.1206 });
  born.driver = born.rider = T0;

  try {
    await signUp(D.page, "driver");
    await onboardDriver(D.page);
    await signUp(R.page, "rider");
    await onboardRider(R.page);
    await approve(D.page, R.page);
    await rideHome(R.page);
    await topUp(R.page);

    const ids = {};
    for (const who of ["driver", "rider"]) ids[who] = (await db.from("users").select("id").eq("ubc_email", PEOPLE[who].email).single()).data.id;
    const podId = (await db.from("pods").select("id").eq("driver_id", ids.driver).eq("status", "active").single()).data.id;
    await trip(D.ctx, D.page, R.page, ids.driver, ids.rider, podId);
  } catch (e) {
    console.error("Recording failed:", e.message);
    await D.page.screenshot({ path: OUT + "fail-driver.png" }).catch(() => {});
    await R.page.screenshot({ path: OUT + "fail-rider.png" }).catch(() => {});
    process.exitCode = 1;
  } finally {
    const endT = (Date.now() - T0) / 1000;
    await D.ctx.close();
    await R.ctx.close();
    await browser.close();
    srv.kill();
    for (const [who, P] of [["driver", D], ["rider", R]]) toVideo(who, P.frames, endT);
    writeFileSync(OUT + "cues.json", JSON.stringify({ cues, aligned: true, people: Object.fromEntries(Object.entries(PEOPLE).map(([k, v]) => [k, v.name])) }, null, 2));
    if (!process.env.KEEP_ACCOUNTS) await cleanup();
    console.log(process.exitCode ? "Failed. See out/demo/fail-*.png" : "Recorded: out/demo/driver.mp4, rider.mp4, cues.json");
  }
}
main();
