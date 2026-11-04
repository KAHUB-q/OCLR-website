import type { Appearance } from "./preferences";
export const appearanceStyleSources = {
  "cute-pastel": "pastel",
  "swiss-minimal": "swiss",
  claymorphism: "clay",
  "manga-halftone": "manga",
  glassmorphism: "glass",
  "esports-broadcast": "esports",
  "retro-arcade": "arcade",
  "frutiger-aero": "frutiger",
  "skyline-pop": "skyline",
  "glacier-blue": "glacier",
  "sakura-circuit": "sakura",
  "graphite-arena": "graphite",
  "orbital-pulse": "orbital",
  "prism-overture": "prism",
  "azure-brush": "azure",
  "verdant-prelude": "verdant",
  "chromatic-origins": "chromatic",
  "frost-waltz": "frost",
} satisfies Record<Exclude<Appearance, "default">, string>;
export function appearanceStylesheet(appearance: Appearance) {
  return appearance === "default"
    ? null
    : `/appearance-styles/${appearance}.css`;
}
const pending = new Map<string, Promise<void>>();
/** Load a new appearance before changing its selector, keeping the current paint. */
export function ensureAppearanceStylesheet(
  appearance: Appearance,
): Promise<void> {
  const href = appearanceStylesheet(appearance);
  if (!href) return Promise.resolve();
  const existing = document.querySelector<HTMLLinkElement>(
    `link[data-oclr-appearance-style="${appearance}"]`,
  );
  if (existing?.sheet) {
    existing.disabled = false;
    return Promise.resolve();
  }
  const current = pending.get(href);
  if (current) return current;
  const promise = new Promise<void>((resolve, reject) => {
    const link = existing ?? document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.oclrAppearanceStyle = appearance;
    const loaded = () => {
      link.media = "all";
      pending.delete(href);
      resolve();
    };
    const failed = () => {
      link.remove();
      pending.delete(href);
      reject(new Error("Appearance stylesheet could not be loaded."));
    };
    link.addEventListener("load", loaded, { once: true });
    link.addEventListener("error", failed, { once: true });
    if (!existing) {
      link.media = "not all";
      document.head.append(link);
    }
  });
  pending.set(href, promise);
  return promise;
}
export function activateAppearanceStylesheet(appearance: Appearance) {
  for (const link of document.querySelectorAll<HTMLLinkElement>(
    "link[data-oclr-appearance-style]",
  ))
    link.disabled = link.dataset.oclrAppearanceStyle !== appearance;
  document.documentElement.dataset.appearance = appearance;
}
