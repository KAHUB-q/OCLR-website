import { EventStatistics } from "@/components/event-statistics";
import {
  publicArchiveStatistics,
  type PublicArchiveStatistics,
} from "@/lib/archive-statistics-reads";
import { getPublicEdition } from "@/lib/content";
import { previewScores, type EventScore } from "@/lib/event-statistics";
import { HttpError } from "@/lib/http";
import { remotePage } from "@/lib/remote-page";
import { remoteMode } from "@/lib/data-source";
import { publicSeasonSeries } from "@/lib/ratings";
import { archiveSeasonSeries } from "@/lib/season-series-source";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const { edition: slug } = await params;
  if (!(await getPublicEdition(slug))) notFound();
  const preview = previewScores(slug);
  if (!remoteMode() && !process.env.DATABASE_URL)
    return <EventStatistics edition={slug} scores={preview ?? []} />;
  let scores: EventScore[] = [];
  let coverage: PublicArchiveStatistics | undefined;
  try {
    const data = await publicArchiveStatistics(slug);
    coverage = data;
    scores = data.plays.map((p) => ({
      osuId: p.osuId,
      teamId: p.teamId,
      player:
        data.players.find((u) => u.osuId === p.osuId)?.username ??
        String(p.osuId),
      team: data.teams.find((t) => t.id === p.teamId)?.name ?? p.teamId,
      round: p.stage,
      slot: p.slot,
      title: p.title,
      mapId: p.beatmapId,
      score: p.score,
      rawScore: p.rawScore,
      scoreMultiplier: p.scoreMultiplier,
      accuracy: p.accuracy,
      combo: p.combo,
      mods: p.mods.join(" "),
      mp: p.mpId,
      game: String(p.gameId),
      fixture: p.fixtureId,
    }));
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 404)) throw error;
  }
  // Use one archive release for both projections. A missing archive selects the live reader;
  // an empty or partial release is not supplemented with games from another authority.
  const series = coverage
    ? archiveSeasonSeries(coverage)
    : await publicSeasonSeries(slug);
  return (
    <EventStatistics
      edition={slug}
      scores={coverage ? scores : (preview ?? [])}
      coverage={coverage}
      series={series}
    />
  );
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
