import {
  exhibitionNotice,
  competitionStageLabel,
} from "@/lib/competition-stage";
import { InfoNote } from "@/components/info-note";
import { historicalPage } from "@/components/historical-archive";
import { MatchDetailsView } from "@/components/match-details";
import { MappoolActionIcon } from "@/components/mappool-action-icon";
import { SheetIcon } from "@/components/sheet-icon";
import styles from "./match-summary.module.css";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { formatDate } from "@/lib/editions";
import { publicFixture } from "@/lib/public-competition";
import { remotePage } from "@/lib/remote-page";
import Link from "next/link";
import { notFound } from "next/navigation";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Match details") };
}

async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string; fixtureId: string }>;
}) {
  const tr = await getAppTranslations();

  const { edition: slug, fixtureId } = await params;
  const archivePage = await historicalPage(slug, "match", fixtureId);
  if (archivePage) return archivePage;
  const f = await publicFixture(slug, fixtureId);
  if (!f) notFound();
  const result = f.result;
  function teamLabel(
    { team, label }: NonNullable<typeof f>["home"],
    side: "home" | "away",
  ) {
    return (
      <div className={styles.team} data-side={side}>
        {team && !team.exhibition ? (
          <Link href={`/tournaments/${slug}/teams/${team.id}`}>{label}</Link>
        ) : (
          <span>{label}</span>
        )}
        {team && result?.winnerTeamId === team.id && (
          <small className={styles.winner}>
            <SheetIcon kind="check" />
            {tr("Winner")}
          </small>
        )}
      </div>
    );
  }
  return (
    <>
      <Link className="text-link" href={`/tournaments/${slug}/results`}>
        {tr("← All matches")}
      </Link>
      {f.stage === "exhibition" && (
        <p className="notice">{tr(exhibitionNotice)}</p>
      )}
      <PageHeading
        eyebrow={`${tr(competitionStageLabel(f.stage))} / ${f.roundName}`}
        title={f.label}
      >
        {f.status === "cancelled" ? (
          tr("Cancelled — no winner assumed")
        ) : result ? (
          tr("Approved and published result")
        ) : (
          <>
            {f.status === "ended" && <>{tr("Ended")} · </>}
            {tr("Awaiting published result")}
          </>
        )}
      </PageHeading>
      <section className={`panel ${styles.summary}`}>
        <div className={styles.scoreboard}>
          {teamLabel(f.home, "home")}
          <strong className={styles.score}>
            {result ? (
              <>
                <span data-side="home">{result.homeWins}</span>
                <span className={styles.separator}> : </span>
                <span data-side="away">{result.awayWins}</span>
              </>
            ) : (
              tr("vs")
            )}
          </strong>
          {teamLabel(f.away, "away")}
        </div>
        {result?.draw && <p className={styles.draw}>{tr("Approved draw")}</p>}
        <div className={styles.resources}>
          {f.scheduledAt ? (
            <time dateTime={f.scheduledAt}>
              {formatDate(f.scheduledAt, f.timeZone, tr.locale)}
            </time>
          ) : (
            <span>{tr("Match time TBA")}</span>
          )}
          {f.pool && (
            <Link href={`/tournaments/${slug}/mappools/${f.pool.id}`}>
              {tr("Released mappool: ")}
              {f.pool.name}
            </Link>
          )}
          {result?.mpUrl && (
            <a href={result.mpUrl} target="_blank" rel="noreferrer">
              {tr("osu! multiplayer source #")}
              {result.mpId} ↗
            </a>
          )}
          {result?.vodUrl && (
            <a href={result.vodUrl} target="_blank" rel="noreferrer">
              <MappoolActionIcon kind="replays" />
              {tr("Watch match recording")}
            </a>
          )}
        </div>
        {!f.confirmed && (
          <p className="notice">
            {tr(
              "This fixture awaits confirmation against published progression. No score or multiplayer source is shown until the teams agree with the approved record.",
            )}
          </p>
        )}
        {result ? (
          <>
            {result.publicNote && (
              <InfoNote>
                <p className="notice">{result.publicNote}</p>
              </InfoNote>
            )}
            {!!result.refereeGames?.length && (
              <section className={styles.outcomes}>
                <h2>{tr("Referee-recorded map outcomes")}</h2>
                <ol>
                  {result.refereeGames.map((game, index) => {
                    const side =
                      game.winnerTeamId === f.home.team?.id
                        ? "home"
                        : game.winnerTeamId === f.away.team?.id
                          ? "away"
                          : undefined;
                    return (
                      <li key={index}>
                        <span className={styles.order} aria-hidden="true">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <a
                          href={`https://osu.ppy.sh/beatmaps/${game.beatmapId}`}
                        >
                          <span className={styles.mod}>{game.category}</span>
                          <span>
                            {tr("Beatmap {value0}", { value0: game.beatmapId })}
                          </span>
                        </a>
                        <span className={styles.outcome} data-side={side}>
                          {side
                            ? f[side].label
                            : tr(
                                game.winnerTeamId ? "Unresolved" : "Tied game",
                              )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
            <p className={styles.updated}>
              {tr("Published · Updated")}{" "}
              {tr(formatDate(result.updatedAt, f.timeZone, tr.locale))}
            </p>
          </>
        ) : (
          <InfoNote>
            <p className="muted">
              {tr(
                "Scores and source links appear after separate review, approval and publication.",
              )}
            </p>
          </InfoNote>
        )}
      </section>
      {(f.details || !result?.refereeGames) && (
        <MatchDetailsView
          details={f.details}
          mpRecordOnly={Boolean(result?.refereeGames)}
          slug={slug}
          teams={[f.home.team, f.away.team].flatMap((t) => (t ? [t] : []))}
          timeZone={f.timeZone}
        />
      )}
    </>
  );
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
