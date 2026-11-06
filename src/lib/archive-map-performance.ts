import { sql } from "drizzle-orm";
import { db } from "@/db";
import { currentPublicStatisticsVersion } from "./archive-read";
import { remoteMode } from "./data-source";
import { slotCategory } from "./mappool-model";
import {
  finishMapPerformance,
  minimumCountedScore,
  type PlayerMapRow,
} from "./player-map-performance-model";

type RankedMap = Omit<PlayerMapRow, "category">;
type RankedResult = { maps: RankedMap[]; teamMaps: number };

/** Internal SQL over one validated public generation, also used by EXPLAIN tests.
 * All game participants establish rank/mean/result. Only the player's rows cross
 * the database boundary; bench games contribute only to the team denominator.
 */
export function archiveMapPerformanceQuery(
  generationId: string,
  osuId: number,
  rosterTeams: string[],
) {
  return sql`
    WITH facts AS NOT MATERIALIZED (
      SELECT position, fixture_id, game_id, osu_id, team_id, stage, title,
        slot, played_at, score, raw_score, accuracy, mods, winner_team_id
      FROM archive_read_plays
      WHERE generation_id = ${generationId}::uuid
        AND raw_score >= ${sql.raw(String(minimumCountedScore))}
    ), player_games AS (
      SELECT DISTINCT game_id FROM facts WHERE osu_id = ${osuId}
    ), player_teams AS (
      SELECT unnest(${sql.param(rosterTeams)}::text[]) AS team_id
      UNION SELECT team_id FROM facts WHERE osu_id = ${osuId}
    ), team_maps AS (
      -- Deduplicate each team's maps before combining teams. This also permits
      -- a parameterized index-only scan instead of scanning the whole season.
      SELECT count(DISTINCT g.game_id)::integer AS total
      FROM player_teams t CROSS JOIN LATERAL (
        SELECT DISTINCT game_id FROM facts WHERE team_id = t.team_id
      ) g
    ), game_facts AS MATERIALIZED (
      SELECT f.* FROM facts f JOIN player_games USING (game_id)
    ), game_stats AS (
      SELECT game_id, count(*) AS participants,
        sum(score::double precision ORDER BY position) / count(*) AS mean_score
      FROM game_facts GROUP BY game_id
    ), ranked AS (
      SELECT game_id, osu_id,
        rank() OVER (PARTITION BY game_id ORDER BY score DESC) AS placement
      FROM game_facts
    ), player_ranks AS (
      -- The original model assigns a duplicate UID its best competition rank.
      SELECT game_id, min(placement) AS placement FROM ranked
      WHERE osu_id = ${osuId} GROUP BY game_id
    ), explicit_winners AS (
      SELECT DISTINCT ON (game_id) game_id, winner_team_id
      FROM game_facts WHERE winner_team_id IS NOT NULL AND winner_team_id <> ''
      ORDER BY game_id, position
    ), team_totals AS (
      SELECT game_id, team_id,
        sum(raw_score::double precision ORDER BY position) AS total
      FROM game_facts GROUP BY game_id, team_id
    ), team_ranks AS (
      SELECT *, rank() OVER (PARTITION BY game_id ORDER BY total DESC) AS rank
      FROM team_totals
    ), team_results AS (
      SELECT game_id, count(*) AS teams,
        count(*) FILTER (WHERE rank = 1) AS leaders,
        min(team_id) FILTER (WHERE rank = 1) AS winner
      FROM team_ranks GROUP BY game_id
    )
    SELECT (SELECT total FROM team_maps) AS "teamMaps",
      coalesce(jsonb_agg(jsonb_build_object(
        'fixtureId', p.fixture_id, 'gameId', p.game_id, 'stage', p.stage,
        'title', p.title, 'slot', p.slot, 'at', p.played_at,
        'placement', r.placement, 'accuracy', p.accuracy, 'mods', p.mods,
        'teamSize', CASE WHEN s.participants >= 7 THEN 4
          WHEN s.participants >= 5 THEN 3 ELSE NULL END,
        'effectiveRating', CASE WHEN s.mean_score > 0
          THEN p.score::double precision / s.mean_score ELSE NULL END,
        'result', CASE
          WHEN w.winner_team_id IS NOT NULL THEN
            CASE WHEN w.winner_team_id = p.team_id THEN 'win' ELSE 'loss' END
          WHEN t.teams < 2 THEN NULL
          WHEN t.leaders > 1 THEN 'tie'
          WHEN t.winner = p.team_id THEN 'win' ELSE 'loss' END
      ) ORDER BY p.position) FILTER (WHERE p.osu_id = ${osuId}), '[]'::jsonb) AS maps
    FROM game_facts p
    JOIN game_stats s USING (game_id)
    JOIN player_ranks r USING (game_id)
    JOIN team_results t USING (game_id)
    LEFT JOIN explicit_winners w USING (game_id)
    WHERE p.osu_id = ${osuId}
  `;
}

/** Missing/stale generations fall back to the existing published-source model.
 * The guard and aggregate share a read-only snapshot, including saved-read APIs.
 */
export async function relationalArchiveMapPerformance(
  slug: string,
  osuId: number,
  rosterTeams: string[],
) {
  if (remoteMode() || process.env.OCLR_ARCHIVE_READ_MODEL === "jsonb")
    return undefined;
  return db().transaction(
    async (tx) => {
      const version = await currentPublicStatisticsVersion(slug, tx);
      if (!version) return undefined;
      const result = await tx.execute<RankedResult>(
        archiveMapPerformanceQuery(version.id, osuId, rosterTeams),
      );
      const row = result.rows[0];
      return finishMapPerformance(
        row.maps.map((map) => ({
          ...map,
          category: slotCategory(map.slot),
          mods: [...new Set(map.mods)].sort(),
        })),
        row.teamMaps,
      );
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
