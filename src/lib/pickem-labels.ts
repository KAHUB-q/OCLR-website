import type { AppTranslator } from "@/i18n/translate";
import type { PickemStatus } from "./pickem-types";

export function pickemStatusText(tr: AppTranslator, status: PickemStatus) {
  switch (status) {
    case "open":
      return tr("Open for picks");
    case "closed":
      return tr("Picks closed");
    case "pending":
      return tr("Awaiting official result");
    case "settled":
      return tr("Scored");
    case "void":
      return tr("Void");
  }
}

export function pickemVoidText(tr: AppTranslator, reason: string | null) {
  if (reason === "fixture_changed")
    return tr("The matchup changed. This prediction does not count.");
  if (reason === "round_changed")
    return tr("The round rules changed. This prediction does not count.");
  if (reason === "cancelled")
    return tr("The match was cancelled. This prediction does not count.");
  return tr("This match prediction does not count.");
}
