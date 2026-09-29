import type { CaseFilm as Film } from "@/lib/types";
import { cn } from "@/lib/utils";
import styles from "./CaseFilm.module.css";

/**
 * The live project on screen: the desktop film and, beside it, the phone
 * film at the same height. Below 1024 px only the phone film shows. Muted,
 * looping, never preloaded; RevealObserver plays them only in view.
 */
export function CaseFilm({ film }: { film: Film }) {
  const video = (src: string, poster: string) => (
    <video
      className={styles.media}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-label={film.alt}
      data-inview-play=""
    />
  );

  return (
    <figure className={cn(styles.film, film.mobile && styles.pair)}>
      <div className={styles.desktop}>{video(film.desktop.src, film.desktop.poster.src)}</div>
      {film.mobile ? <div className={styles.phone}>{video(film.mobile.src, film.mobile.poster.src)}</div> : null}
    </figure>
  );
}
