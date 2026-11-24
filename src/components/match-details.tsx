"use client";
import Link from "./pending-link";
import { useAppTranslations } from "@/i18n/shared";
import { formatDate } from "@/lib/editions";
import { mappoolDisplayName } from "@/lib/mappool-label";
import type { MatchDetailGame, MatchDetails } from "@/lib/match-details-model";
import { PlayerRatings } from "./player-ratings";
import styles from "./match-details.module.css";

function MapResultSummary({
  game,
  index,
  slug,
  teamNames,
  timeZone,
  exhibition,
  historical,
  mpRecordOnly,
}: {
  game: MatchDetailGame;
  index: number;
  slug: string;
  teamNames: readonly [string, string];
  timeZone: string;
  exhibition: boolean;
  historical: boolean;
  mpRecordOnly: boolean;
}) {
  const tr = useAppTranslations();
  const number = (value: number | null) =>
    value === null ? tr("Not recorded") : value.toLocaleString(tr.locale);
  const date = (value: string | null) =>
    value ? formatDate(value, timeZone, tr.locale) : tr("Not recorded");
  const [first, second] = game.effectiveTotals;
  const complete = first !== null && second !== null;
  const winner =
    game.included && complete && first !== second
      ? first > second
        ? 0
        : 1
      : -1;
  const slot = game.poolSlot;
  return (
    <div className={styles.mapSummary}>
      <header className={styles.mapHeader}>
        <div className={styles.mapContext}>
          {slot && (
            <Link
              className={styles.poolSlot}
              href={`/tournaments/${slug}/mappools/${encodeURIComponent(slot.poolId)}#${encodeURIComponent(slot.anchor)}`}
            >
              <strong>{slot.slot}</strong>{" "}
              {historical
                ? mappoolDisplayName(tr, slot.poolName, slot.poolId)
                : slot.poolName}{" "}
              <span aria-hidden="true">↗</span>
            </Link>
          )}
          <span>
            {tr("MAP ")}
            {index + 1}
          </span>
          {game.exMode && <span className="badge">{tr("EX mode")}</span>}
          {!mpRecordOnly && (
            <span className={styles.mapStatus}>
              {game.included
                ? exhibition
                  ? tr("Included in exhibition result")
                  : tr("Included in official result")
                : exhibition
                  ? tr("Excluded from exhibition result")
                  : tr("Excluded from official result")}
            </span>
          )}
        </div>
        <h3>
          {game.beatmap?.artist ? `${game.beatmap.artist} — ` : ""}
          {game.beatmap?.title ?? tr("Beatmap unavailable")}
        </h3>
        <div className={styles.mapContext}>
          <span>{game.beatmap?.difficulty ?? tr("Not recorded")}</span>
          {game.beatmapId && (
            <a
              className="text-link"
              href={`https://osu.ppy.sh/beatmaps/${game.beatmapId}`}
              rel="noreferrer"
            >
              {tr("osu! beatmap")} ↗
            </a>
          )}
        </div>
      </header>
      {!mpRecordOnly && (
        <section className={styles.reviewedTotals}>
          <h4>{tr("Reviewed totals")}</h4>
          {game.included ? (
            <>
              <dl className={styles.teamTotals}>
                {teamNames.map((name, teamIndex) => (
                  <div
                    key={teamIndex}
                    className={
                      teamIndex === winner ? styles.winningTotal : undefined
                    }
                  >
                    <dt>
                      {name}
                      {teamIndex === winner && (
                        <span className={styles.winnerLabel}>
                          {tr("Winner")}
                        </span>
                      )}
                    </dt>
                    <dd>{number(game.effectiveTotals[teamIndex])}</dd>
                  </div>
                ))}
              </dl>
              {!complete || first === second ? (
                <p className="small muted">
                  {tr("Winner")}:{" "}
                  {complete ? tr("Approved tied map") : tr("Not recorded")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="muted">{tr("Not applicable")}</p>
          )}
        </section>
      )}
      <details className={styles.mpDetails} open={mpRecordOnly || undefined}>
        <summary>{tr("Original MP and game details")}</summary>
        <dl className="detail-list">
          <div>
            <dt>{tr("Actual MP totals")}</dt>
            <dd>
              {teamNames[0]}: {number(game.rawTotals[0])} · {teamNames[1]}:{" "}
              {number(game.rawTotals[1])}
            </dd>
          </div>
          <div>
            <dt>{tr("Settings")}</dt>
            <dd>
              {game.modsKnown
                ? game.mods.join(" / ") || "NM"
                : tr("Not recorded")}{" "}
              · {game.mode ?? tr("Not recorded")} ·{" "}
              {game.teamType ?? tr("Not recorded")} ·{" "}
              {game.scoringType ?? tr("Not recorded")}
            </dd>
          </div>
          <div>
            <dt>{tr("Time")}</dt>
            <dd>
              {date(game.startTime)} → {date(game.endTime)}
            </dd>
          </div>
          <div>
            <dt>{tr("Source")}</dt>
            <dd>
              <a
                className="text-link"
                href={`https://osu.ppy.sh/community/matches/${game.mpId}`}
                rel="noreferrer"
              >
                MP #{game.mpId}
              </a>{" "}
              · {tr("Game {value0}", { value0: game.gameId })}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  );
}

export function MatchDetailsView({
  details,
  slug,
  teams,
  timeZone,
  historical = false,
  mpRecordOnly = false,
}: {
  details: MatchDetails | null;
  slug: string;
  teams: { id: string; name: string; exhibition?: boolean }[];
  timeZone: string;
  historical?: boolean;
  mpRecordOnly?: boolean;
}) {
  const tr = useAppTranslations();
  const exhibition = teams.some((t) => t.exhibition);
  const number = (value: number | null | undefined) =>
    value == null ? tr("Not recorded") : value.toLocaleString(tr.locale);
  const team = (id: string | null) =>
    teams.find((t) => t.id === id)?.name ?? tr("Unresolved");
  if (!details)
    return (
      <section className="section-space stack">
        <h2>{tr("Played maps")}</h2>
        <p role="status" className="notice">
          {tr("Match details unavailable.")}
        </p>
      </section>
    );
  const wins = [0, 0];
  for (const game of details.games.filter((g) => g.included)) {
    const [a, b] = game.effectiveTotals;
    if (a !== null && b !== null && a !== b) wins[a > b ? 0 : 1]++;
  }
  return (
    <>
      <section
        className={`section-space stack ${styles.details}`}
        aria-label={tr("Played maps")}
      >
        <h2>{tr("Played maps")}</h2>
        {details.technicalAdjudication && (
          <p className="notice">
            {tr("Technical adjudication; recorded series score")}
          </p>
        )}
        {!mpRecordOnly && (
          <p>
            {tr("Reviewed played-map wins")}: {team(details.teamIds[0])}{" "}
            {wins[0]} : {wins[1]} {team(details.teamIds[1])}
          </p>
        )}
        <ul>
          {details.sources.map((s) => (
            <li key={s.mpId}>
              <a
                className="text-link"
                href={`https://osu.ppy.sh/community/matches/${s.mpId}`}
                rel="noreferrer"
              >
                MP #{s.mpId}
              </a>
              {!s.complete && <> · {tr("Partial source")}</>}
            </li>
          ))}
        </ul>
        {!details.games.length && (
          <p>
            {mpRecordOnly
              ? tr("Match details unavailable.")
              : tr("No approved scored games available for rating.")}
          </p>
        )}
        {details.games.map((g, i) => (
          <article
            className="panel stack"
            id={`game-${g.gameId}`}
            key={`${g.mpId}:${g.gameId}`}
          >
            <MapResultSummary
              game={g}
              index={i}
              slug={slug}
              teamNames={[team(details.teamIds[0]), team(details.teamIds[1])]}
              timeZone={timeZone}
              exhibition={exhibition}
              historical={historical}
              mpRecordOnly={mpRecordOnly}
            />
            {g.rosterMapping && (
              <p className="notice">{tr("Team mapping adjusted")}</p>
            )}
            {details.failedScorePolicy === "zero" &&
              g.scores.some(
                (s) =>
                  s.included &&
                  s.passed === false &&
                  s.total !== null &&
                  s.total !== 0 &&
                  s.effectiveTotal === 0,
              ) && <p className="notice">{tr("Failed scores counted as 0")}</p>}
            {!!g.withheldScores && (
              <p className="notice">{tr("Player data incomplete")}</p>
            )}
            {!g.scores.length ? (
              <p>{tr("No public player scores available.")}</p>
            ) : (
              <details open={mpRecordOnly || g.included}>
                <summary>{tr("Player scores")}</summary>
                <div
                  className="table-scroll"
                  role="region"
                  tabIndex={0}
                  aria-label={`${tr("Game {value0}", { value0: g.gameId })} · ${tr("Player scores; scroll horizontally")}`}
                >
                  <table className={styles.scores}>
                    <caption>
                      {mpRecordOnly
                        ? tr("Recorded MP scores")
                        : tr("Actual MP scores and reviewed contribution")}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">{tr("Player")}</th>
                        <th scope="col">{tr("Team")}</th>
                        <th scope="col">{tr("Lobby team / slot")}</th>
                        <th scope="col">{tr("Score")}</th>
                        {!mpRecordOnly && (
                          <th scope="col">{tr("Reviewed score")}</th>
                        )}
                        {g.scores.some(
                          (s) => (s.statisticsMultiplier ?? 1) !== 1,
                        ) && <th scope="col">{tr("Statistics score")}</th>}
                        <th scope="col">{tr("Accuracy")}</th>
                        <th scope="col">{tr("Combo")}</th>
                        <th scope="col">300 / 100 / 50 / {tr("Miss")}</th>
                        <th scope="col">{tr("Mods")}</th>
                        <th scope="col">{tr("Pass / fail")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.scores.map((s, index) => (
                        <tr
                          key={`${s.osuId}:${index}`}
                          data-lobby-team={
                            s.lobbyTeam === "red" || s.lobbyTeam === "blue"
                              ? s.lobbyTeam
                              : undefined
                          }
                        >
                          <th scope="row">
                            {exhibition ? (
                              <a
                                className="text-link"
                                href={`https://osu.ppy.sh/users/${s.osuId}`}
                                rel="noreferrer"
                              >
                                {s.username}
                              </a>
                            ) : (
                              <Link
                                className="text-link"
                                href={`/players/${s.osuId}?edition=${slug}`}
                              >
                                {s.username}
                              </Link>
                            )}
                            {s.mapping === "substitution" && (
                              <span className="small">
                                {" "}
                                · {tr("Substitute")}
                              </span>
                            )}
                          </th>
                          <td>
                            {s.teamId &&
                            teams.some(
                              (t) => t.id === s.teamId && t.exhibition,
                            ) ? (
                              team(s.teamId)
                            ) : s.teamId ? (
                              <Link
                                className="text-link"
                                href={`/tournaments/${slug}/teams/${s.teamId}`}
                              >
                                {team(s.teamId)}
                              </Link>
                            ) : (
                              tr("Unresolved")
                            )}
                          </td>
                          <td>
                            <span className={styles.lobbyTeam}>
                              {s.lobbyTeam === "blue"
                                ? tr("Blue")
                                : s.lobbyTeam === "red"
                                  ? tr("Red")
                                  : s.lobbyTeam === "none"
                                    ? tr("No team")
                                    : tr("Not recorded")}
                            </span>{" "}
                            / {number(s.slot)}
                          </td>
                          <td>{number(s.total)}</td>
                          {!mpRecordOnly && (
                            <td>
                              {s.included
                                ? number(s.effectiveTotal)
                                : tr("Not applicable")}
                            </td>
                          )}
                          {g.scores.some(
                            (row) => (row.statisticsMultiplier ?? 1) !== 1,
                          ) && (
                            <td>
                              {number(s.statisticsTotal)}
                              {(s.statisticsMultiplier ?? 1) !== 1 && (
                                <span className="small muted">{` · EZ × ${s.statisticsMultiplier}`}</span>
                              )}
                            </td>
                          )}
                          <td>
                            {s.accuracy === null
                              ? tr("Not recorded")
                              : `${(s.accuracy * 100).toFixed(2)}%`}
                          </td>
                          <td>{number(s.combo)}</td>
                          <td>
                            {[
                              s.hits?.great,
                              s.hits?.ok,
                              s.hits?.meh,
                              s.hits?.miss,
                            ]
                              .map(number)
                              .join(" / ")}
                          </td>
                          <td>
                            {s.modsKnown
                              ? s.mods.join(" / ") || "NM"
                              : tr("Not recorded")}
                          </td>
                          <td>
                            {s.passed === null
                              ? tr("Not recorded")
                              : s.passed
                                ? tr("Pass")
                                : tr("Fail")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {g.scores.some((s) =>
                  Object.values(s.providerScores).some((v) => v !== null),
                ) && (
                  <details>
                    <summary>{tr("Additional provider score values")}</summary>
                    <ul>
                      {g.scores.map((s, index) => (
                        <li key={`${s.osuId}:${index}`}>
                          {s.username}
                          {" · score: "}
                          {number(s.providerScores.score)}
                          {" · legacy_total_score: "}
                          {number(s.providerScores.legacy)}
                          {" · total_score: "}
                          {number(s.providerScores.total)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </details>
            )}
          </article>
        ))}
      </section>
      {!mpRecordOnly && (
        <section className="section-space stack">
          <h2>{tr("Match Rating")}</h2>
          {exhibition ? (
            <p className="notice">
              {tr(
                "Exhibition results do not count toward official standings or career history.",
              )}
            </p>
          ) : details.rating ? (
            <PlayerRatings
              report={details.rating}
              slug={slug}
              historical={historical}
              compact
            />
          ) : (
            <p role="status" className="notice">
              {tr("Rating unavailable; approved score data needs review.")}
            </p>
          )}
        </section>
      )}
    </>
  );
}
