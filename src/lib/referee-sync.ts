import type { RefereeWorkspace } from "./referee-workspace";
import type { RefereeEvent } from "./referee-model";
import { refereeTeamSide } from "./referee-team-side";

export type BpSyncStep = "notice" | "map" | "mods";
export type BpSyncMetadata = {
  eventId: string;
  selectionId: string;
  step: BpSyncStep;
  predecessorId: string | null;
  withdrawn: boolean;
};
/** Fixed-prefix, one-line notice. This cannot become a Bancho or raw IRC command. */
export function isBpNotice(text: string) {
  return (
    /^\[OCLR BP #\d{1,6}\] (?:WITHDRAW )?(?:BAN|PICK|TB) [A-Z]{2}\d{1,4} \| [^|\p{Cc}\p{Cf}\u2028\u2029]{1,64} \| https:\/\/osu\.ppy\.sh\/b\/[1-9]\d{0,9}$/u.test(
      text,
    ) && new TextEncoder().encode(text).length <= 380
  );
}

export const scoreNoticePrefix = "[OCLR SCORE #";
const scoreNoticeMaxLength = 300;
const scoreNoticeMaxBytes = 380;
const scoreNoticeEncoder = new TextEncoder();

export function isScoreNotice(text: string) {
  return (
    text.length <= scoreNoticeMaxLength &&
    /^\[OCLR SCORE #\d{1,6}\] [A-Z]{2}\d{1,4} \| [^|\p{Cc}\p{Cf}\u2028\u2029]{1,80} \d+ - \d+ [^|\p{Cc}\p{Cf}\u2028\u2029]{1,80} \| (?:Next: (?:BAN|PICK) (?:RED|BLUE) [^|\p{Cc}\p{Cf}\u2028\u2029]{1,48}|Next: TB|Series complete|No next step|Awaiting referee ruling)(?![\s\S])/u.test(
      text,
    ) &&
    scoreNoticeEncoder.encode(text).length <= scoreNoticeMaxBytes
  );
}

function scoreTeamName(
  name: string,
  fallback: string,
  budget?: { bytes: number; length: number },
) {
  const characters = Array.from(
    name.replace(/[|\p{Cc}\p{Cf}\u2028\u2029]/gu, " ").trim(),
  ).slice(0, budget ? 80 : 48);
  if (!budget) return characters.join("").trimEnd() || fallback;

  let remainingBytes = budget.bytes;
  let label = "";
  for (const character of characters) {
    remainingBytes -= scoreNoticeEncoder.encode(character).length;
    if (remainingBytes < 0 || label.length + character.length > budget.length)
      break;
    label += character;
  }
  return label.trimEnd() || fallback;
}

export function scoreNoticeSource(
  workspace: RefereeWorkspace,
  event: RefereeEvent,
  namedScore = false,
) {
  const outcome = event.payload;
  if (outcome.type !== "attempt_resolved") return null;
  const { projection, teams } = workspace;
  if (teams.length !== 2) return null;
  const selection = projection.activeSelections.find(
    (item) => item.id === outcome.pickId,
  );
  const attempt = selection?.attempts.at(-1);
  const map = workspace.maps.find((item) => item.id === selection?.entryId);
  if (
    !map ||
    !attempt ||
    attempt.id !== outcome.attemptId ||
    attempt.status !== outcome.status ||
    attempt.winnerTeamId !== outcome.winnerTeamId ||
    (outcome.status !== "completed" &&
      !(
        outcome.status === "tied" &&
        workspace.session?.basis.tiedMapPolicy === "count_as_draw"
      )) ||
    workspace.events.some(
      ({ ordinal, payload }) =>
        ordinal > event.ordinal &&
        payload.type === "attempt_resolved" &&
        payload.attemptId === outcome.attemptId &&
        (payload.status !== outcome.status ||
          payload.winnerTeamId !== outcome.winnerTeamId),
    )
  )
    return null;

  const { homeTeamId, awayTeamId } = workspace.fixture;
  const home = teams.find((team) => team.id === homeTeamId);
  const away = teams.find((team) => team.id === awayTeamId);
  if (!home || !away) return null;
  const next = projection.nextStep;
  let prompt = "Awaiting referee ruling";
  if (projection.complete) prompt = "Series complete";
  else if (!next) prompt = "No next step";
  else if (!projection.issues.length) {
    if (next.kind === "tb") prompt = "Next: TB";
    else {
      const team = teams.find((item) => item.id === next.teamId);
      const side = refereeTeamSide(workspace.fixture, next.teamId);
      if (team && side !== "neutral") {
        const name = scoreTeamName(team.name, "Team");
        prompt = `Next: ${next.kind.toUpperCase()} ${side.toUpperCase()} ${name}`;
      }
    }
  }
  const header = `${scoreNoticePrefix}${event.ordinal}] ${map.category}${map.position} | `;
  const score = ` ${projection.score[home.id] ?? 0} - ${projection.score[away.id] ?? 0} `;
  const footer = ` | ${prompt}`;
  let red = "RED",
    blue = "BLUE";
  if (namedScore) {
    const rest = header + score + footer;
    const budget = {
      bytes: Math.floor(
        (scoreNoticeMaxBytes - scoreNoticeEncoder.encode(rest).length) / 2,
      ),
      length: Math.floor((scoreNoticeMaxLength - rest.length) / 2),
    };
    red = scoreTeamName(home.name, red, budget);
    blue = scoreTeamName(away.name, blue, budget);
  }
  const text = header + red + score + blue + footer;
  return isScoreNotice(text) ? text : null;
}
export function bpSyncSource(workspace: RefereeWorkspace, eventId: string) {
  const event = workspace.events.find((e) => e.id === eventId);
  if (!event) return null;
  const withdrawn = event.payload.type === "selection_voided";
  const selectionId =
    event.payload.type === "selection_recorded"
      ? event.id
      : event.payload.type === "selection_voided"
        ? event.payload.selectionId
        : null;
  const selection = workspace.projection.selections.find(
    (s) => s.id === selectionId,
  );
  const map = workspace.maps.find((m) => m.id === selection?.entryId);
  if (!selection || !map || !selectionId) return null;
  const team =
    workspace.teams.find((t) => t.id === selection.teamId)?.name ?? "TB";
  const name =
    Array.from(team.replace(/[|\p{Cc}\p{Cf}\u2028\u2029]/gu, " ").trim())
      .slice(0, 48)
      .join("") || "Team";
  const text = `[OCLR BP #${event.ordinal}] ${withdrawn ? "WITHDRAW " : ""}${selection.kind.toUpperCase()} ${map.category}${map.position} | ${name} | https://osu.ppy.sh/b/${map.beatmapId}`;
  return isBpNotice(text)
    ? { event, selection, map, selectionId, withdrawn, text }
    : null;
}
