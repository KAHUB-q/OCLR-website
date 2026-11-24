import type { Edition } from "./editions";
import { eventPreview } from "./event-preview";
import { publicParticipantCount } from "./players";

// Only short, unqualified totals have a deterministic answer. Capacity,
// pending applications, team-specific totals and compound questions use RAG.
export function asksRegistrationCount(question: string) {
  const query = question
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[?？。!！.]+$/, "")
    .trim();
  const chinese = query.replace(
    /^(?:請問|请问)?(?:目前|現在|现在|這屆|这届|本屆|本届)?\s*/,
    "",
  );
  return (
    /^(?:有?(?:多少|[幾几])(?:個|个|位|名)?(?:人|[選选]手)(?:已[經经]?)?[報报]名(?:了)?|(?:已[經经]?)?[報报]名(?:了|的)?(?:有)?(?:多少|[幾几])(?:個|个|位|名)?(?:人|[選选]手)|[報报]名人[數数](?:(?:是|有)?多少)?)$/.test(
      chinese,
    ) ||
    /^(?:how many (?:people|players) (?:have |have already |are )?(?:signed up|registered)(?: so far)?|(?:what is |what's )?(?:the )?(?:registration|sign-up) count)$/.test(
      query,
    )
  );
}

export async function registrationCount(edition: Edition) {
  const historical = Boolean(edition.archive);
  const count =
    edition.archive?.players.length ??
    eventPreview(edition.slug)?.players.length ??
    (await publicParticipantCount(edition.slug));
  if (count === null) return null;
  const text = historical
    ? `The published historical roster lists ${count} players. The total number of applications is not available.`
    : `Publicly accepted registrations: ${count}. The total including private applications is not published.`;
  return {
    count,
    historical,
    source: {
      title: "Players",
      url: `/tournaments/${edition.slug}/players`,
      text,
    },
  };
}
