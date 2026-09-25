import Image from "next/image";

import type { Media } from "@/lib/types";
import { cn } from "@/lib/utils";
import styles from "./CaseMedia.module.css";

interface CaseMediaProps {
  media: Media;
  /** Responsive `sizes` for the image: the only width the browser downloads. */
  sizes: string;
  priority?: boolean;
}

/**
 * Fills its frame. Images are optimised by next/image (AVIF/WebP, lazy by
 * default). Videos never preload: they play only in view (RevealObserver)
 * and the poster holds the frame until then.
 */
export function CaseMedia({ media, sizes, priority = false }: CaseMediaProps) {
  const treatment = media.treatment === "mono" ? styles.mono : undefined;

  if (media.kind === "video") {
    return (
      <video
        className={cn(styles.media, treatment)}
        src={media.src}
        poster={media.poster.src}
        muted
        loop
        playsInline
        preload="none"
        aria-label={media.alt}
        data-inview-play=""
      />
    );
  }

  return (
    <Image
      src={media.src}
      alt={media.alt}
      fill
      sizes={sizes}
      placeholder="blur"
      priority={priority}
      className={cn(styles.media, treatment)}
    />
  );
}
