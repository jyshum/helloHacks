// Cuts the two recorded phones into the ~70 s demo video.
// Reads out/demo/{driver,rider}.mp4 + cues.json (from record.mjs), writes out/demo/Hopped-demo.mp4.
// The cut is described below in terms of named moments, so a re-recording needs no re-timing.
// Run: node scripts/demo/edit.mjs
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const OUT = new URL("../../out/demo/", import.meta.url).pathname;
const WORK = OUT + "work/";
const FPS = 30;
const W = 1920, H = 1080;
const PHONE_H = 930; // on-screen phone height (screen area), px
const PHONE_W = Math.round((PHONE_H * 780) / 1688);

const { cues, people } = JSON.parse(readFileSync(OUT + "cues.json", "utf8"));
const cue = (key) => {
  const [who, name] = key.split(":");
  const c = cues.find((x) => x.who === who && x.name === name);
  if (!c) throw new Error(`No cue ${key}`);
  return c.t;
};
const C = (key, dt = 0) => cue(key) + dt;

// ---- The cut -------------------------------------------------------------------------------
// layout: "driver" | "rider" (one phone, centred) | "split" (both). active: which phone is lit.
// Times are wall-clock seconds of the recording (both phones share one clock).
// One phone at a time at real speed (the recording itself is paced like a person, with tap
// highlights). Only typing and driving are sped up. Cut on purpose: the signup form, the rider's
// onboarding (same screens), the wallet top-up (the end receipt shows the auto-payment).
const plan = [
  { card: "title", dur: 2.2 },

  // DRIVER: landing → tap Get started → (signup cut) → onboarding.
  { layout: "driver", from: C("driver:landing", -0.2), to: C("driver:signup", 0.3), speed: 1 },
  { layout: "driver", from: C("driver:verified", 0.4), to: C("driver:car", 0.3), speed: 1 },
  { layout: "driver", from: C("driver:car", 0.3), to: C("driver:pod_ready", 1.6), speed: 1.6 },

  // RIDER: (onboarding cut) finds the driver's pod, previews it, joins.
  { layout: "rider", from: C("rider:pods_for_you", -0.4), to: C("rider:pending", 1.0), speed: 1,
    zoom: { who: "rider", from: C("rider:fare_breakdown", -0.6), to: C("rider:pending", -0.9), scale: 1.18, origin: [50, 80] } },

  // DRIVER: the request lands live; approve.
  { layout: "driver", from: C("driver:request_arrives", -1.0), to: C("driver:approved", 1.2), speed: 1,
    zoom: { who: "driver", from: C("driver:request_arrives", -0.6), to: C("driver:approved", 1.2), scale: 1.18, origin: [50, 72] } },
  // RIDER: in the pod; taps in for the ride home.
  { layout: "rider", from: C("rider:in_pod", -0.5), to: C("rider:in_pod", 2.0), speed: 1 },
  { layout: "rider", from: C("rider:ride_home_sheet", -2.2), to: C("rider:ride_home_in", 0.9), speed: 1 },

  // TRIP DAY.
  { layout: "driver", from: C("driver:start_pickup", -2.0), to: C("driver:driving", 0.6), speed: 1 },
  { layout: "rider", from: C("rider:tracking", 0.6), to: C("rider:driver_here", -0.4), speed: 3 },
  { layout: "rider", from: C("rider:driver_here", -0.4), to: C("rider:driver_here", 2.4), speed: 1,
    zoom: { who: "rider", from: C("rider:driver_here", -0.4), to: C("rider:driver_here", 2.4), scale: 1.15, origin: [50, 62] } },
  { layout: "driver", from: C("driver:picked_up", -2.2), to: C("driver:picked_up", 0.8), speed: 1 },
  { layout: "driver", from: C("driver:picked_up", 0.8), to: C("driver:arrived", -0.3), speed: 6 },
  { layout: "driver", from: C("driver:arrived", -0.3), to: C("driver:arrived", 3.0), speed: 1 },
  { layout: "rider", from: C("rider:receipt", -0.6), to: C("rider:receipt", 3.2), speed: 1 },
  { card: "end", dur: 2.6 },
];

// ---- Timeline maths --------------------------------------------------------------------------
// Hard cap: if the cut runs long, speed every clip up evenly so the whole video fits.
const MAX_SECONDS = 92;
{
  const cards = plan.filter((p) => p.card).reduce((t, p) => t + p.dur, 0);
  const clips = plan.filter((p) => !p.card).reduce((t, p) => t + (p.to - p.from) / p.speed, 0);
  const k = clips / (MAX_SECONDS - cards);
  if (k > 1) for (const p of plan) if (!p.card) p.speed *= k;
}
const segs = [];
let T = 0;
for (const p of plan) {
  const dur = p.card ? p.dur : (p.to - p.from) / p.speed;
  segs.push({ ...p, start: T, dur });
  T += dur;
}
const TOTAL = T;
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = (a, b, k) => a + (b - a) * k;
const GAP = 290; // half the distance between phones in split view

// Where each phone sits for a layout.
function place(layout, active) {
  const lit = (who) => active === "both" || active === who || layout === who;
  const base = (who, x, show) => ({ x, op: show ? 1 : 0, dim: show && !lit(who) ? 1 : 0 });
  if (layout === "driver") return { driver: base("driver", W / 2, true), rider: base("rider", W / 2 + 700, false) };
  if (layout === "rider") return { driver: base("driver", W / 2 - 700, false), rider: base("rider", W / 2, true) };
  return { driver: base("driver", W / 2 - GAP, true), rider: base("rider", W / 2 + GAP, true) };
}
function blend(a, b, k) {
  const out = {};
  for (const who of ["driver", "rider"]) out[who] = Object.fromEntries(Object.keys(a[who]).map((f) => [f, lerp(a[who][f], b[who][f], k)]));
  return out;
}

function stateAt(t) {
  const i = Math.max(0, segs.findIndex((s) => t >= s.start && t < s.start + s.dur));
  const s = segs[i === -1 ? segs.length - 1 : i];
  const local = t - s.start;
  const st = { card: null, cardOp: 0, wall: null, times: null, phones: null, zoom: { driver: [1, 50, 50], rider: [1, 50, 50] } };
  // Each phone's footage time. `lag` plays a phone's footage from a different moment (so two
  // things recorded one after the other can run side by side); `hold` freezes it at a moment.
  const timesOf = (seg, wall) =>
    Object.fromEntries(["driver", "rider"].map((w) => [w, Math.min(wall + (seg.lag?.[w] ?? 0), seg.hold?.[w] ?? Infinity)]));
  if (s.card) {
    st.card = s.card;
    // Fade cards in/out against the neighbouring clip.
    // Fade in only; the fade out happens once, over the start of the next clip.
    st.cardOp = Math.min(1, s.start === 0 ? 1 : local / 0.35);
    const near = segs[i + 1] && !segs[i + 1].card ? segs[i + 1] : segs[i - 1];
    if (near && !near.card) {
      st.wall = near === segs[i + 1] ? near.from : near.to;
      st.times = timesOf(near, st.wall);
      st.phones = place(near.layout, near.active);
    }
    return st;
  }
  st.wall = s.from + local * s.speed;
  st.times = timesOf(s, st.wall);
  let now = place(s.layout, s.active);
  // Glide from the previous layout over the first 0.5 s of a clip.
  const prev = segs[i - 1];
  if (prev && !prev.card && (prev.layout !== s.layout || prev.active !== s.active)) now = blend(place(prev.layout, prev.active), now, ease(local / 0.5));
  // The phone sliding out keeps showing its last frame from the previous clip.
  if (prev && !prev.card && prev.layout !== s.layout && local < 0.5 && s.layout !== "split") {
    const out = s.layout === "driver" ? "rider" : "driver";
    st.times[out] = timesOf(prev, prev.to)[out];
  }
  if (prev?.card) {
    st.card = prev.card;
    st.cardOp = Math.max(0, 1 - local / 0.35);
  }
  st.phones = now;
  if (s.zoom) {
    const z = s.zoom;
    const zt = st.times[z.who];
    const k = ease((zt - z.from) / 0.9) * (1 - ease((zt - (z.to - 0.9)) / 0.9));
    st.zoom[z.who] = [lerp(1, z.scale, k), z.origin[0], z.origin[1]];
  }
  return st;
}

// ---- Render ------------------------------------------------------------------------------------

async function main() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK + "frames", { recursive: true });

  console.log(`Cut: ${TOTAL.toFixed(1)} s`);
  // Both phones were captured on one clock from t = 0, so video time = recording time.
  for (const who of ["driver", "rider"]) copyFileSync(OUT + who + ".mp4", WORK + who + ".mp4");

  writeFileSync(WORK + "stage.html", stageHtml());
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto("file://" + WORK + "stage.html");
  await page.evaluate(() => Promise.all([...document.querySelectorAll("video")].map((v) => (v.readyState >= 2 ? 0 : new Promise((r) => (v.onloadeddata = r))))));

  const frames = Math.round(TOTAL * FPS);
  for (let f = 0; f < frames; f++) {
    const st = stateAt(f / FPS);
    const vt = st.times;
    await page.evaluate(({ st, vt }) => window.apply(st, vt), { st, vt });
    await page.screenshot({ path: `${WORK}frames/${String(f).padStart(5, "0")}.jpg`, type: "jpeg", quality: 94 });
    if (f % 150 === 0) console.log(`  frame ${f}/${frames}`);
  }
  await browser.close();

  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", WORK + "frames/%05d.jpg", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT + "Hopped-demo.mp4"]);
  rmSync(WORK, { recursive: true, force: true });
  console.log(`Done: out/demo/Hopped-demo.mp4 (${TOTAL.toFixed(1)} s)`);
}

function stageHtml() {
  const label = (who) => `${who === "driver" ? "Driver" : "Rider"} · ${people[who].split(" ")[0]}`;
  const phone = (who) => `
    <div class="phone" id="${who}">
      <div class="tag">${label(who)}</div>
      <div class="zoom"><div class="bezel"><video src="${who}.mp4" muted preload="auto"></video><div class="dim"></div></div></div>
    </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:${W}px;height:${H}px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Inter",sans-serif;
    background:radial-gradient(1200px 700px at 20% 10%,#e6f0fb 0,transparent 60%),radial-gradient(1000px 800px at 85% 90%,#dbe8f7 0,transparent 60%),#f4f8fc}
  .phone{position:absolute;top:${(H - PHONE_H) / 2 + 22}px;left:0;width:${PHONE_W}px;height:${PHONE_H}px;will-change:transform,opacity}
  .zoom{width:100%;height:100%;transform-origin:50% 50%}
  .bezel{position:relative;width:100%;height:100%;border-radius:58px;overflow:hidden;background:#000;
    box-shadow:0 0 0 11px #0b1b2e,0 0 0 12px #2a3a52,0 40px 90px rgba(0,33,69,.28)}
  video{width:100%;height:100%;object-fit:cover;display:block}
  .dim{position:absolute;inset:0;background:#0b1b2e;opacity:0}
  .tag{position:absolute;top:-58px;left:50%;transform:translateX(-50%);padding:9px 18px;border-radius:999px;
    background:rgba(255,255,255,.8);box-shadow:0 6px 20px rgba(0,33,69,.10);color:#002145;font-weight:650;font-size:21px;white-space:nowrap}
  .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;
    background:radial-gradient(900px 600px at 50% 40%,#0b3570 0,#00204F 70%);color:#fff;text-align:center}
  .card .logo{height:120px}
  .card p{margin-top:34px;font-size:40px;color:rgba(255,255,255,.82);font-weight:500}
  .card small{margin-top:40px;font-size:22px;color:rgba(255,255,255,.55);font-weight:500}
  </style></head><body>
  ${phone("driver")}${phone("rider")}
  <div class="card" id="title"><img class="logo" src="file:///Users/jshum/Desktop/code-folders/helloHacks/public/brand/logo.png" alt="Hopped"><p>Carpool to UBC with your pod.</p></div>
  <div class="card" id="end"><img class="logo" src="file:///Users/jshum/Desktop/code-folders/helloHacks/public/brand/logo.png" alt="Hopped"><p>Same route. Same people. Every week.</p><small>Payments shown with demo money</small></div>
  <script>
  const vids = { driver: document.querySelector("#driver video"), rider: document.querySelector("#rider video") };
  function seek(v, t) {
    t = Math.min(t, v.duration - 0.04);
    if (Math.abs(v.currentTime - t) < 0.001) return Promise.resolve();
    return new Promise((r) => { v.addEventListener("seeked", () => r(), { once: true }); v.currentTime = t; });
  }
  window.apply = async (st, vt) => {
    for (const id of ["title", "end"]) document.getElementById(id).style.opacity = st.card === id ? st.cardOp : 0;
    const waits = [];
    for (const who of ["driver", "rider"]) {
      const el = document.getElementById(who);
      const p = st.phones && st.phones[who];
      if (!p || p.op <= 0.001) { el.style.opacity = 0; continue; }
      el.style.opacity = p.op;
      el.style.transform = "translateX(" + (p.x - ${PHONE_W / 2}) + "px) scale(" + (1 - 0.05 * p.dim) + ")";
      el.querySelector(".dim").style.opacity = 0.42 * p.dim;
      el.querySelector(".tag").style.opacity = 1 - 0.5 * p.dim;
      const [z, ox, oy] = st.zoom[who];
      const zel = el.querySelector(".zoom");
      zel.style.transformOrigin = ox + "% " + oy + "%";
      zel.style.transform = "scale(" + z + ")";
      if (vt) waits.push(seek(vids[who], vt[who]));
    }
    await Promise.all(waits);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };
  </script></body></html>`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
