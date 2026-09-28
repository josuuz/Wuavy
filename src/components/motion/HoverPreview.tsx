"use client";

import Image, { type StaticImageData } from "next/image";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import styles from "./HoverPreview.module.css";

interface PreviewImage {
  src: StaticImageData;
  alt: string;
  /** Brand photo treatment (black and white). Client work keeps its colour: pass false. */
  mono?: boolean;
  /** A before/after: the frame opens on `before`, then `src` sweeps in over it on the channel angle. */
  before?: StaticImageData;
}

interface HoverPreviewProps {
  images: PreviewImage[];
  /** Frame width in CSS; the height follows `ratio`. */
  width?: string;
  ratio?: string;
  /** Tags on a before/after. */
  labels?: { before: string; after: string };
}

/**
 * A frame that follows the pointer over a list and shows the image of the
 * row under it (rows carry data-preview="<index>"; the list carries
 * data-preview-host). The frame trails with a soft lag, leans into the
 * direction of travel and swaps images through a mask. Pointer devices
 * only; touch never sees it (the rows stand alone).
 * Ideas from 21st.dev "Hover Image List" and "Cursor Follow", rebuilt here.
 */
export function HoverPreview({
  images,
  width = "clamp(220px, 20vw, 360px)",
  ratio = "4 / 5",
  labels = { before: "Antes", after: "Depois" },
}: HoverPreviewProps) {
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = frame.current;
    const host = el?.closest<HTMLElement>("[data-preview-host]");
    if (!el || !host) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!fine) return;

    const target = { x: 0, y: 0 };
    const pos = { x: 0, y: 0 };
    const pointer = { x: 0, y: 0 };
    let raf = 0;
    let active = -1;
    let over: Element | null = null;
    let fresh = false;

    // Pointer events only record; the frame reads the list's box once and writes once.
    const tick = () => {
      if (fresh) {
        fresh = false;
        const rect = host.getBoundingClientRect();
        target.x = pointer.x - rect.left;
        target.y = pointer.y - rect.top;
        const row = over?.closest<HTMLElement>("[data-preview]");
        const index = row ? Number(row.dataset.preview) : -1;
        if (active < 0 && index >= 0) {
          pos.x = target.x;
          pos.y = target.y;
        }
        setActive(index);
      }
      const vx = target.x - pos.x;
      pos.x += vx * 0.14;
      pos.y += (target.y - pos.y) * 0.14;
      const lean = Math.max(-8, Math.min(8, vx * 0.04));
      el.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${lean.toFixed(2)}deg)`;
      raf = Math.abs(vx) > 0.3 || Math.abs(target.y - pos.y) > 0.3 ? requestAnimationFrame(tick) : 0;
    };

    const setActive = (index: number) => {
      if (index === active) return;
      active = index;
      el.dataset.active = index >= 0 ? String(index) : "";
      el.querySelectorAll<HTMLElement>("[data-slide]").forEach((slide) => {
        slide.toggleAttribute("data-on", Number(slide.dataset.slide) === index);
      });
    };

    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      over = event.target as Element;
      fresh = true;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => setActive(-1);

    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={frame} className={styles.frame} style={{ width, aspectRatio: ratio }} aria-hidden="true" data-active="">
      {images.map((image, i) => {
        const tone = cn(styles.image, image.mono !== false && styles.mono);
        return (
          <div key={i} className={styles.slide} data-slide={i}>
            {image.before ? (
              <>
                <Image src={image.before} alt="" fill sizes="480px" className={tone} />
                <span className={styles.tag}>{labels.before}</span>
              </>
            ) : null}
            <div className={cn(styles.layer, image.before && styles.after)}>
              <Image src={image.src} alt="" fill sizes="480px" className={tone} />
              {image.before ? <span className={cn(styles.tag, styles.tagAfter)}>{labels.after}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
