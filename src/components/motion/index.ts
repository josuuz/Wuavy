/*
  Motion layer. Sections import motion only from here, never from a library.
  Each primitive takes plain props (text, delay, trigger), so its engine
  (CSS today; WAAPI or motion/react later) can change without touching a section.
  See README.md in this folder for the contract and the planned components.
*/

export { TextReveal } from "./TextReveal";
export { LineReveal } from "./LineReveal";
export { WidthWave } from "./WidthWave";
export { ImageReveal } from "./ImageReveal";
export { RevealObserver } from "./RevealObserver";
export { HeroChoreography } from "./HeroChoreography";
export { PageTransition } from "./PageTransition";
export { CustomCursor } from "./CustomCursor";
export { SmoothScroll } from "./SmoothScroll";
export { ScrollMarquee } from "./ScrollMarquee";
export { ReadReveal } from "./ReadReveal";
export { RollText } from "./RollText";
export { HoverPreview } from "./HoverPreview";
