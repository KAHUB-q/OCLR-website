import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rankingSnapshots } from "@/db/schema";
import archiveBeatmaps from "@/data/archive-beatmaps.json";
import { archiveContentHash } from "./archive-read-model";
import { FITTED_DIFFICULTY_POLICY } from "./fitted-difficulty";

type Reader = Pick<ReturnType<typeof db>, "execute" | "select">;
export type RankingKind = typeof rankingSnapshots.$inferSelect.kind;
type RankingSources = Record<RankingKind, string>;

// Bump the corresponding version when a projection or its stored shape changes.
const careerPolicy = 1;
const beatmapPolicy = {
  version: 1,
  fittedDifficulty: FITTED_DIFFICULTY_POLICY,
  artwork: archiveContentHash(archiveBeatmaps.maps),
};

/** Fingerprint live inputs in PostgreSQL. Historical inputs and shared score
 * policies are already covered by the performance source hash. */
export async function rankingSnapshotSources(
  reader: Reader,
  performanceHash: string,
): Promise<RankingSources> {
  const {
    rows: [live],
  } = await reader.execute<RankingSources>(sql`
    WITH editions AS (
      SELECT slug FROM edition_state
      WHERE configuration->>'published' = 'true'
        AND jsonb_typeof(configuration->'archive') IS DISTINCT FROM 'object'
    ), public_teams AS (
      SELECT t.id FROM teams t JOIN editions e ON e.slug = t.edition_slug
      JOIN captains c ON c.edition_slug = t.edition_slug AND c.user_id = t.captain_id
      WHERE t.identity_published AND t.roster_published AND c.published
        AND t.finalized_at IS NOT NULL AND t.archived_at IS NULL
    ), public_fixtures AS (
      SELECT f.id, f.home_team_id, f.away_team_id, f.home_source_id, f.away_source_id,
             f.home_source_outcome, f.away_source_outcome, f.scheduled_at, f.status, f.exhibition_sides,
             s.kind, r.id AS round_id, r.name, r.position AS round_position, f.position,
             rev.revision, rev.proposal, imp.external_match_id
      FROM fixtures f JOIN editions e ON e.slug = f.edition_slug
      JOIN tournament_rounds r ON r.id = f.round_id
      JOIN tournament_stages s ON s.id = r.stage_id
      LEFT JOIN match_results mr ON mr.fixture_id = f.id AND mr.published_at IS NOT NULL
      LEFT JOIN result_revisions rev ON rev.fixture_id = f.id AND rev.revision = mr.published_revision
        AND rev.approved_at IS NOT NULL AND rev.approved_by IS NOT NULL
      LEFT JOIN match_imports imp ON imp.id = rev.import_id AND imp.fixture_id = f.id
      WHERE f.published_at IS NOT NULL
    ), public_pools AS (
      SELECT p.id, p.edition_slug, p.name, r.name AS round_name, r.position, s.kind,
             m.id AS entry_id, m.beatmap_id, m.category, m.position AS slot_position,
             m.metadata->'setId' AS set_id, m.metadata->'title' AS title,
             m.metadata->'difficulty' AS difficulty, m.metadata->'stars' AS stars
      FROM mappools p JOIN editions e ON e.slug = p.edition_slug
      JOIN tournament_rounds r ON r.id = p.round_id
      JOIN tournament_stages s ON s.id = r.stage_id
      JOIN mappool_entries m ON m.pool_id = p.id
      WHERE p.published_at IS NOT NULL
    )
    SELECT encode(sha256(convert_to(jsonb_build_array(
      (SELECT jsonb_agg(t.id ORDER BY t.id) FROM public_teams t),
      (SELECT jsonb_agg(jsonb_build_array(m.team_id, m.user_id) ORDER BY m.team_id, m.user_id)
       FROM memberships m JOIN public_teams t ON t.id = m.team_id WHERE m.left_at IS NULL),
      (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM public_fixtures f)
    )::text, 'UTF8')), 'hex') AS career,
    encode(sha256(convert_to(coalesce(
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id, p.entry_id) FROM public_pools p), '[]'
    )::text, 'UTF8')), 'hex') AS beatmap
  `);
  return {
    career: archiveContentHash([careerPolicy, performanceHash, live.career]),
    beatmap: archiveContentHash([beatmapPolicy, performanceHash, live.beatmap]),
  };
}

export async function matchingRankingSnapshot(
  reader: Reader,
  kind: RankingKind,
  sourceHash: string,
) {
  const [snapshot] = await reader
    .select({
      result: rankingSnapshots.result,
      calculatedAt: rankingSnapshots.calculatedAt,
    })
    .from(rankingSnapshots)
    .where(
      and(
        eq(rankingSnapshots.kind, kind),
        eq(rankingSnapshots.sourceHash, sourceHash),
      ),
    )
    .orderBy(desc(rankingSnapshots.calculatedAt), desc(rankingSnapshots.id))
    .limit(1);
  return snapshot;
}

export async function hasRankingSnapshot(
  reader: Reader,
  kind: RankingKind,
  sourceHash: string,
) {
  const [snapshot] = await reader
    .select({ id: rankingSnapshots.id })
    .from(rankingSnapshots)
    .where(
      and(
        eq(rankingSnapshots.kind, kind),
        eq(rankingSnapshots.sourceHash, sourceHash),
      ),
    )
    .limit(1);
  return Boolean(snapshot);
}
