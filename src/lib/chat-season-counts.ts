import type { AppTranslator } from "@/i18n/translate";
import { isUpcomingMatch, matches } from "./chat-competition-sources";
import { asksRegistrationCount, registrationCount } from "./chat-registration";
import type { Edition } from "./editions";
import { recordedArchiveMatch } from "./historical-archive";
import { publicMappools } from "./mappool-reads";
import { publishedTeams } from "./team-reads";

const categories = {
  teams: {
    title: "Teams",
    path: "teams",
    subject:
      /^(?:[隊队](?:伍)?(?:[參参][賽赛])?|[參参][賽赛][隊队]伍|[戰战][隊队]|teams?(?: are (?:participating|competing))?)$/,
  },
  matches: {
    title: "Schedule",
    path: "schedule",
    subject: /^(?:比[賽赛]|[賽赛]事|[賽赛]程|matches|fixtures)$/,
  },
  results: {
    title: "Results",
    path: "results",
    subject:
      /^(?:(?:已公布的?)?(?:[賽赛]果|比[賽赛][結结]果)|比[賽赛](?:已)?(?:公布|有)(?:了)?(?:[賽赛]果|[結结]果)|(?:published )?results|matches (?:with|have) published results)$/,
  },
  upcoming: {
    title: "Schedule",
    path: "schedule",
    subject:
      /^(?:即[將将](?:舉行|举行|[開开]始)的?比[賽赛]|upcoming (?:matches|fixtures)|matches (?:are )?(?:upcoming|still scheduled))$/,
  },
  pools: {
    title: "Mappools",
    path: "mappools",
    subject: /^(?:[圖图]池|曲池|map ?pools?)$/,
  },
  slots: {
    title: "Mappools",
    path: "mappools",
    subject:
      /^(?:[譜谱]面(?:[欄栏]位)?|[圖图]池(?:[譜谱]面|[欄栏]位)|beatmaps?|maps|(?:map|mappool) (?:slots|entries))$/,
  },
};
type Category = keyof typeof categories;

// Match the entire question so a team name, round or second question cannot
// accidentally turn a narrower request into a season-wide total.
export function seasonCountIntent(
  question: string,
): Category | "registration" | null {
  if (asksRegistrationCount(question)) return "registration";
  const query = question
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[?!.。！]+$/, "")
    .trim();
  const chinese = query.replace(
    /^(?:請問|请问)?(?:這一?[屆届]|这一?届|本[屆届]|本[賽赛]季|這個賽季|这个赛季|目前|現在|现在)*[，,\s]*/,
    "",
  );
  if (
    /^(?:接下[來来]|[還还]|剩下)(?:有)?(?:多少|[幾几])[場场](?:比[賽赛])?$/.test(
      chinese,
    )
  )
    return "upcoming";
  if (
    /^[圖图]池(?:[裡里內内中])?(?:一共|[總总]共|共)?有(?:多少|[幾几])(?:[張张個个首])?(?:[圖图]|[譜谱]面|曲目)$/.test(
      chinese,
    )
  )
    return "slots";

  const subject =
    chinese.match(
      /^(?:一共|[總总]共|共)?有?(?:多少|[幾几])(?:支|[場场個个張张]|首|位|名)?(.+)$/,
    )?.[1] ??
    chinese.match(
      /^(.+?)(?:一共|[總总]共|共)?有(?:多少|[幾几])(?:支|[場场個个張张]|首|位|名)?$/,
    )?.[1] ??
    chinese.match(/^(.+?)(?:[數数]量|[總总][數数])(?:是多少)?$/)?.[1] ??
    query.match(
      /^how many (.+?)(?: are there)?(?: (?:in |for )?this season)?$/,
    )?.[1];
  if (!subject) return null;
  if (
    /^(?:[選选]手|[參参][賽赛][選选]手|(?:participating )?players?)$/.test(
      subject,
    )
  )
    return "registration";
  for (const kind of Object.keys(categories) as Category[]) {
    if (categories[kind].subject.test(subject)) return kind;
  }
  return null;
}

export async function seasonCount(
  edition: Edition,
  kind: NonNullable<ReturnType<typeof seasonCountIntent>>,
  now: number,
) {
  if (kind === "registration") {
    const total = await registrationCount(edition);
    return (
      total && {
        ...total,
        kind: total.historical ? ("historicalPlayers" as const) : kind,
      }
    );
  }
  let count: number;
  if (kind === "teams") {
    count = (edition.archive?.teams ?? (await publishedTeams(edition.slug)))
      .length;
  } else if (kind === "pools" || kind === "slots") {
    const sizes = edition.archive
      ? edition.archive.pools.map((pool) => pool.maps.length)
      : (await publicMappools(edition.slug)).map((pool) => pool.entries.length);
    count =
      kind === "pools"
        ? sizes.length
        : sizes.reduce((sum, size) => sum + size, 0);
  } else if (edition.archive) {
    // The public historical schedule and results both list only recorded matches.
    count =
      kind === "upcoming"
        ? 0
        : edition.archive.matches.filter(recordedArchiveMatch).length;
  } else {
    const fixtures = await matches(edition);
    switch (kind) {
      case "matches":
        count = fixtures.length;
        break;
      case "results":
        count = fixtures.filter((match) => match.score !== null).length;
        break;
      case "upcoming":
        count = fixtures.filter((match) => isUpcomingMatch(match, now)).length;
        break;
    }
  }
  const { title, path } = categories[kind];
  return {
    kind,
    count,
    source: {
      title,
      url: `/tournaments/${edition.slug}/${path}`,
      text: `${kind}: ${count}`,
    },
  };
}

export function formatSeasonCount(
  total: NonNullable<Awaited<ReturnType<typeof seasonCount>>>,
  tr: AppTranslator,
) {
  const values = { count: total.count };
  switch (total.kind) {
    case "historicalPlayers":
      return tr(
        "The historical roster lists {count, number} players. The total number of applications is unavailable.",
        values,
      );
    case "registration":
      return tr(
        "Accepted registrations in the public player directory: {count, number}. The total number of applications is not published.",
        values,
      );
    case "teams":
      return tr(
        "This season has {count, plural, one {# published team} other {# published teams}}.",
        values,
      );
    case "matches":
      return tr(
        "The public schedule lists {count, plural, one {# match} other {# matches}}.",
        values,
      );
    case "results":
      return tr(
        "{count, plural, one {# match has a published result} other {# matches have published results}}.",
        values,
      );
    case "upcoming":
      return tr(
        "{count, plural, one {# upcoming match has a scheduled start time} other {# upcoming matches have scheduled start times}}.",
        values,
      );
    case "pools":
      return tr(
        "This season has {count, plural, one {# published mappool} other {# published mappools}}.",
        values,
      );
    case "slots":
      return tr(
        "Published mappools contain {count, plural, one {# map slot} other {# map slots}}. A beatmap in multiple slots counts once per slot.",
        values,
      );
  }
}
