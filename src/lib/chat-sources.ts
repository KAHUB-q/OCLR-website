import { searchSeasonIndex } from "./chat-vectors";
import { matches, poolSources } from "./chat-competition-sources";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatRuleIndexes } from "@/db/schema";
import { getPublicEdition } from "./content";
import { HttpError } from "./http-error";
import {
  rankedSources,
  publishedRuleChapters,
  ruleExcerpts,
} from "./chat-retrieval";
import { informationPreview } from "./tournament-information";
import { tournamentTimeline } from "./tournament-timeline";
import type { Edition } from "./editions";

async function indexedRules(edition: Edition) {
  const chapters = publishedRuleChapters(edition);
  const fingerprint = createHash("sha256")
    .update("excerpts-v1\n")
    .update(JSON.stringify(chapters))
    .digest("hex");
  const [hit] = await db()
    .select({ sections: chatRuleIndexes.sections })
    .from(chatRuleIndexes)
    .where(
      and(
        eq(chatRuleIndexes.editionSlug, edition.slug),
        eq(chatRuleIndexes.fingerprint, fingerprint),
      ),
    );
  if (hit) return hit.sections;
  const sources = ruleExcerpts(chapters);
  await db()
    .insert(chatRuleIndexes)
    .values({ editionSlug: edition.slug, fingerprint, sections: sources })
    .onConflictDoUpdate({
      target: chatRuleIndexes.editionSlug,
      set: { fingerprint, sections: sources },
    });
  return sources;
}

export async function chatEvidence(
  slug: string,
  question: string,
  previous: string,
  now = Date.now(),
  signal?: AbortSignal,
) {
  const edition = await getPublicEdition(slug);
  if (!edition) throw new HttpError(404, "Tournament not found.");
  const base = "/tournaments/" + slug;
  const matchIntent =
    /賽程|赛程|比[分賽赛]|賽果|赛果|下一[場场]|對陣|对阵|schedule|match|score|result|fixture|who won/i;
  const timingIntent =
    /時候|时候|[時时]間|时间|[幾几][點点號号月日]|哪[天日]|何[時时]|[開开]始|[開开][打賽赛放]|截止|[結结]束|日期|[賽赛]程|\b(?:when|start(?:s|ing)?|begins?|dates?|deadlines?|schedule|what time)\b/i;
  const poolIntent =
    /[圖图]池|曲池|mappool|map pool|beatmap|\b(?:nm|hd|hr|dt|fm|tb)\d*\b/i;
  const questionWithContext = question + " " + previous;
  const intentText =
    matchIntent.test(question) || poolIntent.test(question)
      ? question
      : questionWithContext;
  const rules = await indexedRules(edition);
  const sources = rankedSources(rules, question, 3);
  if (!sources.length && previous)
    sources.push(...rankedSources(rules, questionWithContext, 2));
  const timing = timingIntent.test(intentText);
  if (timing && !edition.archive) {
    const preview = informationPreview(slug);
    const rows =
      preview?.schedule ??
      tournamentTimeline(edition, (label) => label, "en").schedule;
    const zone = preview?.timeZone ?? edition.timeZone;
    const timeline = rows.map((row) => ({
      title: row.event,
      url: base + "#schedule",
      text: row.event + " · " + row.date + " (" + zone + ")",
    }));
    sources.push(...rankedSources(timeline, questionWithContext, 8, true));
  }
  if (
    matchIntent.test(intentText) ||
    (timing && (edition.archive || !sources.length))
  ) {
    let fixtures = await matches(edition);
    const next = /下一[場场]|\bnext\b/i.test(intentText);
    if (next)
      fixtures = fixtures
        .filter(
          (f) =>
            f.time && Date.parse(f.time) >= now && !f.score && !f.cancelled,
        )
        .sort((a, b) => Date.parse(a.time!) - Date.parse(b.time!));
    else if (timing && edition.archive && !matchIntent.test(intentText))
      fixtures = fixtures
        .filter((f) => f.time && !f.cancelled)
        .sort((a, b) => Date.parse(a.time!) - Date.parse(b.time!));
    else
      fixtures.sort(
        (a, b) =>
          (Date.parse(b.time ?? "") || 0) - (Date.parse(a.time ?? "") || 0),
      );
    const candidates = fixtures.map((f) => ({
      title: [f.label, f.teams].join(" · "),
      url: `${base}/matches/${encodeURIComponent(f.id)}`,
      text: JSON.stringify({
        scheduledAt: f.time,
        timeZone: edition.timeZone,
        publishedScore: f.score,
        cancelled: f.cancelled ?? false,
      }),
    }));
    sources.push(
      ...(candidates.length
        ? rankedSources(candidates, questionWithContext, next ? 1 : 4, true)
        : [
            {
              title: edition.name,
              url: base + "/schedule",
              text: next
                ? "No upcoming published match."
                : "No published fixtures.",
            },
          ]),
    );
  }
  if (poolIntent.test(intentText)) {
    const maps = await poolSources(edition);
    sources.push(
      ...(maps.length
        ? rankedSources(maps, questionWithContext, 16, true)
        : [
            {
              title: edition.name,
              url: base + "/mappools",
              text: "No published mappools.",
            },
          ]),
    );
  }
  const indexed = await searchSeasonIndex(edition, question, previous, signal);
  const unique = new Map(
    [...indexed, ...sources].map((s) => [
      JSON.stringify([s.url, s.title, s.text]),
      s,
    ]),
  );
  return { edition: edition.name, sources: [...unique.values()] };
}
