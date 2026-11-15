import type { AppTranslator } from "./translate";

/** Localize saved diagnostics without changing provider snapshots or review proofs. */
export function matchReviewMessage(tr: AppTranslator, message: string): string {
  const game = /^Game (\d+): (.+)$/.exec(message);
  if (game) {
    const detail = game[2]
      .split(/(?<=\.) (?=[A-Z])/)
      .map((reason) => matchReviewMessage(tr, reason))
      .join(" ");
    return tr("Game {value0}: {value1}", { value0: game[1], value1: detail });
  }
  const unattributed =
    /^Player (\d+|unknown) has no verified fixture-team attribution\.$/.exec(
      message,
    );
  if (unattributed)
    return tr("Player {value0} has no verified fixture-team attribution.", {
      value0: unattributed[1] === "unknown" ? tr("Unknown") : unattributed[1],
    });
  const substitute =
    /^Player (\d+) is explicitly attributed as a substitute; Admin approval is required\.$/.exec(
      message,
    );
  if (substitute)
    return tr(
      "Player {value0} is explicitly attributed as a substitute; Admin approval is required.",
      {
        value0: substitute[1],
      },
    );
  return tr(message);
}
