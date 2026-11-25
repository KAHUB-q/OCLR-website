import fallbackZones from "@/content/time-zones.json" with { type: "json" };
import { editionSchema } from "./editions";
export const commonTimeZones = [
  "UTC",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Shanghai",
];
/** Snapshot fallback uses the Node/ICU IANA list; selection never canonicalizes saved aliases. */
export function availableTimeZones(current: string) {
  let supported = fallbackZones;
  try {
    if (typeof Intl.supportedValuesOf === "function")
      supported = Intl.supportedValuesOf("timeZone");
  } catch {
    /* Use the bundled IANA snapshot on older runtimes. */
  }
  return [
    ...new Set([
      ...commonTimeZones,
      ...(editionSchema.shape.timeZone.safeParse(current).success
        ? [current]
        : []),
      ...supported,
    ]),
  ];
}
export function timeZoneLabel(zone: string) {
  return zone === "UTC"
    ? "UTC"
    : `${zone.split("/").at(-1)!.replaceAll("_", " ")} — ${zone}`;
}
export function searchTimeZones(zones: string[], query: string) {
  const normalize = (text: string) =>
    text.toLowerCase().replace(/[\s_/-]+/g, "");
  const term = normalize(query);
  const matches = zones.filter((zone) =>
    normalize(timeZoneLabel(zone)).includes(term),
  );
  const identifier = query.trim();
  if (
    !identifier ||
    matches.some((zone) => zone.toLowerCase() === identifier.toLowerCase())
  )
    return matches;

  // Intl's enumerable list omits valid aliases and fixed-offset IANA names.
  const parsed = editionSchema.shape.timeZone.safeParse(identifier);
  return parsed.success ? [...matches, parsed.data] : matches;
}
