// Phone screenshots for the pitch deck (iPhone resolution, 1170×2532), from the real app.
// Uses two throwaway riders that are deleted afterwards. Needs `npm run build` first.
// Run: node --env-file=.env.local scripts/demo/screens.mjs   → out/deck/*.png
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const OUT = new URL("../../out/deck/", import.meta.url).pathname;
const BASE = "http://localhost:3000";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

// Rider in Maya's demo pod (pod screen) and a Richmond commuter on Mei's route (preview + fare).
const RIDERS = [
  { key: "pod", email: "deck.rider1.hopped.demo@student.ubc.ca", name: "Sam Lee", faculty: "Applied Science", year: 2,
    home: { lat: 49.2539, lng: -123.1206 }, area: "Fairview", campus: { lat: 49.2677, lng: -123.247, label: "UBC Bus Exchange" }, days: [1, 2, 3, 4, 5], arrive: "07:45",
    joinDriver: "maya.chen@demo.hoppedin.test" },
  { key: "richmond", email: "deck.rider2.hopped.demo@student.ubc.ca", name: "Priya Shah", faculty: "Science", year: 3,
    home: { lat: 49.1698, lng: -123.1815 }, area: "Richmond Centre", campus: { lat: 49.2567, lng: -123.2438, label: "Thunderbird Park" }, days: [1, 3], arrive: "09:00" },
];

async function cleanup() {
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const r of RIDERS) {
    const { data: u } = await db.from("users").select("id").eq("ubc_email", r.email).maybeSingle();
    if (u) await db.from("users").delete().eq("id", u.id);
    const a = list?.users.find((x) => x.email === r.email);
    if (a) await db.auth.admin.deleteUser(a.id);
  }
}

async function setup() {
  const creds = {};
  for (const r of RIDERS) {
    const password = randomBytes(9).toString("hex");
    const { data: a, error } = await db.auth.admin.createUser({ email: r.email, password, email_confirm: true });
    if (error) throw error;
    const u = must(await db.from("users").insert({
      auth_id: a.user.id, ubc_email: r.email, email_verified: true, full_name: r.name, faculty: r.faculty, year: r.year, role: "both",
      photo_url: `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(r.name)}`,
    }).select("id").single(), "user");
    must(await db.from("commute_profiles").insert({
      user_id: u.id, mode: "rider", home_lat: r.home.lat, home_lng: r.home.lng, home_area: r.area,
      campus_lat: r.campus.lat, campus_lng: r.campus.lng, campus_label: r.campus.label, days: r.days, arrive_by: r.arrive, day_times: {}, active: true,
    }), "profile");
    if (r.joinDriver) {
      const d = must(await db.from("users").select("id").eq("ubc_email", r.joinDriver).single(), "driver");
      const pod = must(await db.from("pods").select("id").eq("driver_id", d.id).eq("status", "active").single(), "pod");
      must(await db.from("pod_members").insert({
        pod_id: pod.id, user_id: u.id, role: "rider", status: "active", days: r.days,
        pickup_lat: r.home.lat, pickup_lng: r.home.lng, pickup_label: `Near home · ${r.area}`, pickup_time: "07:20",
      }), "member");
      creds[r.key] = { email: r.email, password, podId: pod.id };
    } else creds[r.key] = { email: r.email, password };
  }
  return creds;
}

async function phone(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Vancouver", locale: "en-CA" });
  return { ctx, page: await ctx.newPage() };
}
async function login(page, { email, password }) {
  await page.goto(BASE + "/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/pods**", { timeout: 30000 });
}
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png` });

async function main() {
  mkdirSync(OUT, { recursive: true });
  await cleanup();
  const creds = await setup();
  const srv = spawn("npx", ["next", "start", "-p", "3000"], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((r) => srv.stdout.on("data", (d) => String(d).includes("Ready") && r()));
  const browser = await chromium.launch();
  try {
    // 1. Landing page.
    const L = await phone(browser);
    await L.page.goto(BASE);
    await L.page.waitForLoadState("networkidle");
    await sleep(1500);
    await shot(L.page, "1-landing");

    // 2. Pod screen: route map, day picker, rides to campus and home.
    const P = await phone(browser);
    await login(P.page, creds.pod);
    await P.page.goto(`${BASE}/pods/${creds.pod.podId}`);
    await P.page.locator("h1").filter({ hasText: / by \d/ }).first().waitFor({ timeout: 30000 });
    await sleep(5000); // map tiles + route
    await shot(P.page, "2-pod");

    // 3 + 4. Richmond commuter: pod preview (time saved) and the fare breakdown.
    const R = await phone(browser);
    await login(R.page, creds.richmond);
    const card = R.page.locator('[role="button"]').filter({ hasText: "Mei" }).first();
    await card.waitFor({ timeout: 60000 });
    await card.locator("p").first().click();
    await R.page.getByText(/min saved/).waitFor({ timeout: 30000 });
    await sleep(5000);
    await shot(R.page, "3-time-saved");
    await R.page.getByText(/a ride$/).first().click();
    await R.page.getByText("Company fee").waitFor();
    await R.page.getByText("Company fee").scrollIntoViewIfNeeded();
    await sleep(1200);
    await shot(R.page, "4-price");
    console.log("Saved out/deck/1-landing.png, 2-pod.png, 3-time-saved.png, 4-price.png");
  } finally {
    await browser.close();
    srv.kill();
    await cleanup();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
