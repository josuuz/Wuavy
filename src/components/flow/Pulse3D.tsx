"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { PulseState } from "./Pulse";
import { loadPulseModel } from "./pulse-model";
import styles from "./Pulse3D.module.css";

/*
  The Pulse as the real model (public/pulse.glb, built by scripts/pulse-model.py
  from the approved art). Three.js and the model are fetched only when this
  mounts, and only where the Pulse is shown large: small marks and avatars
  keep the drawn Pulse, which costs nothing.

  It breathes and floats, turns a little towards the pointer, leans when
  reached for, and changes expression by sliding the face strip — one
  texture, a column per expression, so a state change costs nothing either.
  The loop runs only while the canvas is on screen and the tab is in front,
  and with motion turned down it moves for a change of state, a hover or a
  press, then settles and stays still.
*/

/** Order of the columns in the face strip; the last one is blank, for the back. */
// The strip scripts/pulse-model.py lays down: one column per expression,
// then a blank one the back of the body uses.
const COLUMN: Record<PulseState, number> = {
  idle: 0,
  welcome: 1,
  happy: 2,
  celebrating: 2,
  thinking: 3,
  calm: 4,
  surprised: 5,
};
const COLUMNS = 7;

/** One WebGL context is plenty for a page: the rest keep the drawing. */
const MAX_LIVE = 1;
let live = 0;

interface Pulse3DProps {
  state: PulseState;
  interactive?: boolean;
  className?: string;
  /** Told once the model is on screen, so the drawn Pulse can step aside. */
  onReady?: () => void;
  /** Told if anything goes wrong, so the drawn Pulse stays. */
  onFail?: () => void;
}

export function Pulse3D({ state, interactive = false, className, onReady, onFail }: Pulse3DProps) {
  const host = useRef<HTMLDivElement>(null);
  // The loop reads these each frame, so they live in a ref and never restart it.
  const wanted = useRef({ state, interactive });
  // The same goes for the callbacks. They are told things; they never decide
  // when the stage is built. Were the effect to depend on them, a parent
  // passing fresh arrows on each render — the ordinary way to write this —
  // would tear down the WebGL context and fetch the model again every time
  // anything above changed.
  const told = useRef({ onReady, onFail });
  const [failed, setFailed] = useState(false);

  // Refreshed after every render, with no dependency list of its own: there
  // is nothing here that could restart the stage, by construction.
  useEffect(() => {
    wanted.current = { state, interactive };
    told.current = { onReady, onFail };
  });

  useEffect(() => {
    if (failed) return;
    const mount = host.current;
    if (!mount || live >= MAX_LIVE) return;
    live += 1;

    let stop = () => {};
    let gone = false;

    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      if (gone) return;

      // The bytes are fetched once per page; the scene is this mount's own,
      // so disposing it on the way out cannot reach another mount's.
      const bytes = await loadPulseModel();
      if (gone) return;
      const gltf = await new GLTFLoader().parseAsync(bytes.slice(0), "/");
      if (gone) return;

      const model = gltf.scene;
      // Anything worth watching: a change of state, a hover, a press, a change
      // of theme. With motion turned down these are the only times it moves.
      let awake = performance.now() + 1200;
      const rouse = (ms = 900) => (awake = Math.max(awake, performance.now() + ms));
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      // A little above the screen's own density: the body's edge is a thin
      // wedge, and at this size it shimmers without the extra samples.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio * 1.6, 3));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;
      renderer.domElement.className = styles.canvas;
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.add(model);
      // The board's light: a soft cream daylight, and the warm bounce from below.
      const sky = new THREE.HemisphereLight(0xfff6ec, 0x6b4a33, 1.35);
      scene.add(sky);
      const key = new THREE.DirectionalLight(0xfff3e6, 1.5);
      key.position.set(-1.4, 2.2, 2.6);
      scene.add(key);
      const warm = new THREE.PointLight(0xff7a3d, 2.6, 5, 2);
      warm.position.set(0, -0.85, 0.75);
      scene.add(warm);

      /*
        The same body, lit for the room it is in. On the light ground it is
        read against white, so the daylight carries it and the warm bounce
        stays a hint; on the dark ground that bounce is what separates it
        from the background, so it comes up a little, but stays a hint too —
        the hemisphere's ground colour used to be a saturated brown, which
        painted every downward-facing curve orange regardless of the point
        light; neutral grey lets that surface read as shadow, the way the
        2.5D drawing's shading does, and leaves the warm colour to the one
        light actually meant to carry it.
      */
      const relight = () => {
        const bright = document.documentElement.getAttribute("data-pulse-theme") === "light";
        sky.color.setHex(0xfff6ec);
        sky.groundColor.setHex(bright ? 0xb0aca4 : 0x7a7266);
        sky.intensity = bright ? 1.4 : 1.1;
        key.intensity = bright ? 1.65 : 1.3;
        warm.intensity = bright ? 0.5 : 0.7;
        renderer.toneMappingExposure = bright ? 1.0 : 1.05;
      };
      relight();
      const theme = new MutationObserver(() => {
        relight();
        rouse(400);
      });
      theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-pulse-theme"] });

      // Framed so the body nearly fills the canvas: it is the subject, not a prop.
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
      camera.position.set(0, 0, 2.45);

      let face: { offset: { x: number } } | null = null;
      model.traverse((node) => {
        const mesh = node as { isMesh?: boolean; material?: { map?: { offset: { x: number } } } };
        if (mesh.isMesh && mesh.material?.map) face = mesh.material.map;
      });

      const size = () => {
        const box = mount.getBoundingClientRect();
        const side = Math.max(1, Math.round(Math.min(box.width, box.height)));
        renderer.setSize(side, side, false);
      };
      size();
      const resize = new ResizeObserver(size);
      resize.observe(mount);

      // The pointer, as a direction from the middle of the canvas.
      const aim = { x: 0, y: 0 };
      const onMove = (event: PointerEvent) => {
        const box = mount.getBoundingClientRect();
        const reach = Math.max(box.width, 220) * 2.4;
        aim.x = Math.max(-1, Math.min(1, (event.clientX - (box.left + box.width / 2)) / reach));
        aim.y = Math.max(-1, Math.min(1, (event.clientY - (box.top + box.height / 2)) / reach));
      };
      window.addEventListener("pointermove", onMove, { passive: true });

      const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
      let seen = true;
      const watch = new IntersectionObserver(([entry]) => (seen = entry.isIntersecting), { threshold: 0.01 });
      watch.observe(mount);

      // What each state does with the body, beyond the face it wears: a
      // welcome leans in, thinking tips away, surprise pulls up short.
      // Everything is eased towards, never snapped to.
      const POSTURE: Record<PulseState, { tilt: number; lift: number; swell: number }> = {
        idle: { tilt: 0, lift: 0, swell: 0 },
        welcome: { tilt: -0.1, lift: 0.035, swell: 0.02 },
        happy: { tilt: -0.05, lift: 0.025, swell: 0.015 },
        thinking: { tilt: 0.08, lift: -0.015, swell: -0.01 },
        surprised: { tilt: -0.03, lift: 0.055, swell: 0.03 },
        celebrating: { tilt: 0, lift: 0.03, swell: 0.02 },
        calm: { tilt: 0.04, lift: -0.02, swell: -0.015 },
      };

      const host = mount.parentElement ?? mount;
      let perk = 0;
      let press = 0;
      const onEnter = () => {
        perk = 1;
        rouse();
      };
      const onPress = () => {
        press = 1;
        rouse();
      };
      host.addEventListener("pointerenter", onEnter);
      host.addEventListener("pointerdown", onPress);

      const born = performance.now();
      let frame = 0;
      const turn = { x: 0, y: 0 };
      const pose = { tilt: 0, lift: 0, swell: 0 };
      let hop = 0;
      let was: PulseState = wanted.current.state;
      const ease = (from: number, to: number, k: number) => from + (to - from) * k;

      const tick = (now: number) => {
        frame = requestAnimationFrame(tick);
        if (!seen || document.hidden) return;

        const { state, interactive } = wanted.current;
        const soft = calm.matches;
        const t = (now - born) / 1000;

        if (state !== was) {
          if (face) face.offset.x = COLUMN[state] / COLUMNS;
          if (state === "celebrating") hop = 1;
          was = state;
          rouse(1400);
        }
        if (soft && now > awake) return;

        // Two breaths of unequal length, so it never beats like a metronome,
        // and a slow drift that now and then almost stops: the pauses are
        // what keep it from looking wound up.
        const alive = soft ? 0 : 1;
        const pace = state === "thinking" ? 0.74 : 1.05;
        const breath = Math.sin(t * pace) * 0.6 + Math.sin(t * pace * 0.41 + 1.7) * 0.4;
        const drift = Math.sin(t * 0.23 + 0.6) * Math.sin(t * 0.37);

        const want = POSTURE[state];
        pose.tilt = ease(pose.tilt, want.tilt, 0.045);
        pose.lift = ease(pose.lift, want.lift, 0.045);
        pose.swell = ease(pose.swell, want.swell, 0.045);
        perk = Math.max(0, perk - 0.018);
        press = Math.max(0, press - 0.05);

        const jump = hop > 0 ? Math.sin((1 - hop) * Math.PI) * 0.13 : 0;
        model.position.y = pose.lift + (breath * 0.022 + drift * 0.012 + perk * 0.02) * alive + jump;
        if (hop > 0) hop = Math.max(0, hop - 0.018);

        // The breath keeps its volume: taller means a touch narrower.
        const tall = 1 + pose.swell + breath * 0.009 * alive - press * 0.05;
        const wide = 1 / Math.sqrt(tall);
        model.scale.set(wide, tall, wide);

        // Turn towards the pointer, further when it is being reached for.
        const pull = (interactive ? 1 : 0.45) * (soft ? 0.35 : 1);
        turn.x = ease(turn.x, aim.y * 0.17 * pull, 0.05);
        turn.y = ease(turn.y, aim.x * 0.4 * pull, 0.05);
        model.rotation.set(turn.x + pose.tilt * 0.35, turn.y, pose.tilt + drift * 0.01 * alive);

        renderer.render(scene, camera);
      };
      frame = requestAnimationFrame(tick);
      told.current.onReady?.();

      stop = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("pointermove", onMove);
        host.removeEventListener("pointerenter", onEnter);
        host.removeEventListener("pointerdown", onPress);
        resize.disconnect();
        watch.disconnect();
        theme.disconnect();
        renderer.domElement.remove();
        renderer.dispose();
        model.traverse((node) => {
          const mesh = node as {
            isMesh?: boolean;
            geometry?: { dispose(): void };
            material?: { map?: { dispose(): void }; dispose(): void };
          };
          if (!mesh.isMesh) return;
          mesh.geometry?.dispose();
          mesh.material?.map?.dispose();
          mesh.material?.dispose();
        });
      };
    })().catch(() => {
      if (gone) return;
      setFailed(true);
      told.current.onFail?.();
    });

    return () => {
      gone = true;
      live -= 1;
      stop();
    };
    // Only a failure may build the stage again: see `told` above.
  }, [failed]);

  if (failed) return null;
  return <div ref={host} className={cn(styles.stage, className)} aria-hidden="true" />;
}
