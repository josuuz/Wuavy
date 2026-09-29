#!/usr/bin/env node
/*
  Case video recorder. Films a live page as a smooth scroll-through and writes
  the two files every case uses: a 16:9 desktop film and a 9:16 phone film,
  plus a poster for each.

  It films frame by frame on a frozen clock (timers, requestAnimationFrame and
  CSS/Web Animations all advance exactly 1/fps per frame), so entrances,
  reveals and scroll-linked motion come out smooth no matter how slow the
  machine is.

  Setup, once (not saved to package.json, so the Vercel build stays lean):
    npm i --no-save playwright-core ffmpeg-static
    npx playwright-core install chromium
  (or point CASE_VIDEO_CHROME at any Chromium/Chrome executable)

  Run from the project root:
    node scripts/case-video.mjs --url https://site.com --slug cliente \
      --stops "#sobre:1.2,#produto+40:1.4,end:1.6"

  Options
    --url            page to film (required)
    --slug           case slug; names the files (required)
    --stops          desktop stops, "selector[+offset]:hold,..." ("end" = page bottom)
    --mobile-stops   phone stops (defaults to --stops)
    --start-hold     seconds on the first screen before scrolling (2.6)
    --speed          desktop scroll speed in px/s (520); phone uses --mobile-speed (420)
    --only           desktop | mobile
    --fps            frames per second (30)

  Output
    public/work/<slug>/<slug>-desktop.mp4   1600x900, H.264, no audio
    public/work/<slug>/<slug>-mobile.mp4    720x1280
    src/assets/work/<slug>-desktop.jpg      posters (first settled screen)
    src/assets/work/<slug>-mobile.jpg
*/
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = {};
process.argv.slice(2).forEach((a, i, all) => {
  if (a.startsWith("--")) args[a.slice(2)] = all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true;
});
if (!args.url || !args.slug) {
  console.error('Usage: node scripts/case-video.mjs --url <url> --slug <slug> [--stops "sel:hold,..."]');
  process.exit(1);
}

// Dependencies come from the project, or from extra folders in CASE_VIDEO_DEPS (";"-separated).
const bases = [process.cwd(), ...(process.env.CASE_VIDEO_DEPS || "").split(";").filter(Boolean)];
function load(name) {
  for (const base of bases) {
    try {
      return createRequire(join(resolve(base), "_.js"))(name);
    } catch {}
  }
  console.error(`Missing ${name}. Run: npm i --no-save playwright-core ffmpeg-static`);
  process.exit(1);
}
const { chromium } = load("playwright-core");
const ffmpeg = load("ffmpeg-static");

const FPS = Number(args.fps || 30);
const ROOT = process.cwd();
const slug = args.slug;

const KINDS = {
  desktop: {
    context: { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 },
    size: [1600, 900],
    speed: Number(args.speed || 520),
    stops: args.stops || "",
  },
  mobile: {
    context: { viewport: { width: 390, height: 693 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    size: [720, 1280],
    speed: Number(args["mobile-speed"] || 420),
    stops: args["mobile-stops"] || args.stops || "",
  },
};

const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

function parseStops(spec) {
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [target, hold] = s.split(/:(?=[\d.]+$)/);
      const m = target.match(/^(.*?)([+-]\d+)?$/);
      return { selector: m[1], offset: Number(m[2] || 0), hold: Number(hold || 1) };
    });
}

async function film(kind) {
  const cfg = KINDS[kind];
  const frames = join(tmpdir(), `case-video-${slug}-${kind}`);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });

  const browser = await chromium.launch({ executablePath: process.env.CASE_VIDEO_CHROME || undefined });
  const context = await browser.newContext({ ...cfg.context, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.clock.install();
  await page.goto(args.url, { waitUntil: "load" });
  await page.addStyleTag({ content: "html{scrollbar-width:none}html::-webkit-scrollbar{display:none}" });
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = "eager"));
    await Promise.all(
      [...document.images].map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r)))),
    );
    await document.fonts.ready;
    // Every CSS transition/animation is paused and set to the frozen clock each frame.
    const born = new Map();
    window.__caseSync = (vt) => {
      for (const a of document.getAnimations()) {
        if (!born.has(a)) born.set(a, vt - 1000 / 60);
        a.pause();
        a.currentTime = Math.max(0, vt - born.get(a));
      }
    };
  });

  const stops = await page.evaluate((list) => {
    const max = document.documentElement.scrollHeight - innerHeight;
    return list
      .map((s) => {
        if (s.selector === "end") return { y: max, hold: s.hold };
        const el = document.querySelector(s.selector);
        if (!el) return null;
        const y = el.getBoundingClientRect().top + scrollY + s.offset;
        return { y: Math.max(0, Math.min(max, Math.round(y))), hold: s.hold };
      })
      .filter(Boolean);
  }, parseStops(cfg.stops));
  if (!stops.length || stops[stops.length - 1].y !== (await page.evaluate(() => document.documentElement.scrollHeight - innerHeight))) {
    stops.push({ y: await page.evaluate(() => document.documentElement.scrollHeight - innerHeight), hold: 1.6 });
  }

  // Timeline: hold on the first screen, then ease from stop to stop.
  const legs = [{ from: 0, to: 0, dur: Number(args["start-hold"] || 2.6) }];
  let at = 0;
  for (const s of stops) {
    if (s.y !== at) legs.push({ from: at, to: s.y, dur: Math.max(1.1, Math.abs(s.y - at) / cfg.speed) });
    legs.push({ from: s.y, to: s.y, dur: s.hold });
    at = s.y;
  }
  const total = legs.reduce((n, l) => n + l.dur, 0);
  const count = Math.round(total * FPS);
  const yAt = (t) => {
    for (const l of legs) {
      if (t <= l.dur) return l.from + (l.to - l.from) * ease(l.dur ? t / l.dur : 1);
      t -= l.dur;
    }
    return at;
  };

  const step = 1000 / FPS;
  const poster = Math.min(count - 1, Math.round(Math.min(2.4, legs[0].dur - 0.1) * FPS));
  process.stdout.write(`${kind}: ${count} frames (${total.toFixed(1)}s) `);
  for (let f = 0; f < count; f++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.round(yAt(f / FPS)));
    await new Promise((r) => setTimeout(r, 24)); // let the browser deliver scroll and intersection events
    await page.clock.runFor(step);
    await page.evaluate((vt) => window.__caseSync(vt), (f + 1) * step);
    await page.screenshot({ path: join(frames, `${String(f).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
    if (f % FPS === 0) process.stdout.write(".");
  }
  process.stdout.write("\n");
  await browser.close();

  const [w, h] = cfg.size;
  const videoDir = join(ROOT, "public", "work", slug);
  const posterDir = join(ROOT, "src", "assets", "work");
  mkdirSync(videoDir, { recursive: true });
  mkdirSync(posterDir, { recursive: true });
  const out = join(videoDir, `${slug}-${kind}.mp4`);
  execFileSync(ffmpeg, [
    "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "%05d.jpg"),
    "-vf", `scale=${w}:${h}:flags=lanczos`, "-c:v", "libx264", "-preset", "slow", "-crf", kind === "desktop" ? "27" : "28",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out,
  ]);
  const posterOut = join(posterDir, `${slug}-${kind}.jpg`);
  execFileSync(ffmpeg, [
    "-y", "-loglevel", "error", "-i", join(frames, `${String(poster).padStart(5, "0")}.jpg`),
    "-vf", `scale=${w}:${h}:flags=lanczos`, "-q:v", "3", posterOut,
  ]);
  rmSync(frames, { recursive: true, force: true });
  console.log(`  ${out}\n  ${posterOut}`);
}

for (const kind of args.only ? [args.only] : ["desktop", "mobile"]) {
  await film(kind);
}
