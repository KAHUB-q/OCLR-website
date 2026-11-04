import { Suspense, use, useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { ConfirmMutation } from "../../src/components/confirm-mutation";
import { TeamEditor } from "../../src/components/team-editor";
import { RefereeAssignment } from "../../src/components/referee-assignment";
import { TournamentEditor } from "../../src/components/tournament-editor";
import { RoundManager } from "../../src/components/round-manager";
import { MappoolEditor } from "../../src/components/mappool-editor";
import { MappoolBatch } from "../../src/components/mappool-batch";
import { StatisticsManager } from "../../src/components/statistics-manager";
import { StaffReadOnlyContext } from "../../src/components/staff-read-only";
import { MappoolActionIcon } from "../../src/components/mappool-action-icon";
import { edition } from "../fixtures/edition";
import en from "../../messages/en.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/workspace.css";
import "../../src/app/pastel-theme.css";

const params = new URLSearchParams(location.search);
const kind = params.get("kind") ?? "text";
document.documentElement.dataset.theme = params.get("theme") ?? "light";
document.documentElement.dataset.appearance = "cute-pastel";

const team = {
  id: "synthetic-team",
  name: "Synthetic team",
  capacity: 4,
  members: [],
  finalizedAt: null,
  avatarKey: null,
} as unknown as Parameters<typeof TeamEditor>[0]["team"];
type RefereeProps = Parameters<typeof RefereeAssignment>[0];
const fixture = {
  id: "synthetic-match",
  label: "Synthetic match",
  refereeIds: [],
  referees: [],
  assignmentRevision: 3,
  scheduledAt: null,
  timeZone: "UTC",
  status: "scheduled",
} as unknown as RefereeProps["fixture"];
const refereeData = {
  canManage: true,
  fixtures: [fixture],
  eligibleReferees: [{ osuId: 12345, username: "Synthetic referee" }],
} as unknown as RefereeProps["data"];

const date = new Date("2026-01-01T00:00:00Z");
const poolData: Parameters<typeof MappoolEditor>[0]["data"] = {
  rounds: [
    {
      id: "round",
      name: "Synthetic round",
      stage: "group",
      position: 1,
      version: 4,
    },
  ],
  pools: [
    {
      id: "pool",
      roundId: "round",
      name: "Synthetic pool",
      version: 7,
      fmMode: null,
      fmRestrictions: "",
      publishedAt: null,
      lockedAt: null,
      selectionLockedAt: null,
      showcaseAt: null,
      updatedAt: date,
    },
  ],
  entries: [
    {
      id: "entry",
      poolId: "pool",
      category: "NM",
      position: 1,
      beatmapId: 101,
      metadataFetchedAt: date,
      metadata: {
        artist: "Synthetic artist",
        title: "Synthetic map",
        difficulty: "Extra",
        mapper: "Synthetic mapper",
        setId: 0,
        mode: "osu",
        stars: 6,
        bpm: 180,
        duration: 180,
        ar: 9,
        od: 9,
        cs: 4,
        hp: 5,
      },
    },
  ],
};
const statistics = {
  slug: "synthetic",
  fixtures: [
    {
      id: "match",
      label: "Synthetic statistics match",
      stage: "Final",
      teams: ["Alpha", "Beta"],
      mpIds: [101],
      score: [1, 0],
    },
  ],
  summaries: [
    {
      fixtureId: "match",
      mpId: 101,
      version: 4,
      stale: false,
      publishedAt: date.toISOString(),
    },
  ],
  pools: [],
  reviews: [],
  blockers: [],
  canPublish: true,
} as unknown as Parameters<typeof StatisticsManager>[0]["initial"];

function RefreshCommit({ gate }: { gate: Promise<void> | null }) {
  if (gate) use(gate);
  return null;
}
function Harness() {
  const [gate, setGate] = useState<Promise<void> | null>(null);
  const [siblingClicks, setSiblingClicks] = useState(0);
  const router: AppRouterInstance = {
    back() {},
    forward() {},
    push() {},
    replace() {},
    prefetch() {},
    bfcacheId: "synthetic",
    refresh() {
      document.documentElement.dataset.refreshes = String(
        Number(document.documentElement.dataset.refreshes ?? 0) + 1,
      );
      setGate(
        new Promise<void>((resolve) => {
          window.addEventListener("finish-refresh", () => resolve(), {
            once: true,
          });
        }),
      );
    },
  };
  return (
    <AppRouterContext.Provider value={router}>
      <SearchParamsContext.Provider value={params}>
        <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
          <StaffReadOnlyContext value={params.has("readonly")}>
            <Suspense fallback={<p>Refreshing synthetic data</p>}>
              <RefreshCommit gate={gate} />
              <main
                className="themed-site private-site"
                style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}
              >
                {kind === "settings" ? (
                  <TournamentEditor
                    data={{
                      edition,
                      revision: 4,
                      applications: 0,
                      registrationPaused: false,
                      readiness: [],
                    }}
                  />
                ) : kind === "round" ? (
                  <RoundManager
                    slug="synthetic"
                    initialStage="group"
                    rounds={[
                      {
                        id: "synthetic-round",
                        name: "Synthetic round",
                        stage: "group",
                        position: 1,
                        version: 4,
                      },
                    ]}
                  />
                ) : kind === "mappool" ? (
                  <MappoolEditor slug="synthetic" data={poolData} />
                ) : kind === "batch" ? (
                  <MappoolBatch
                    url="/api/synthetic/mappools"
                    pool={poolData.pools[0]}
                    entries={poolData.entries}
                    mode="batch"
                    onFeedback={() => {}}
                  />
                ) : kind === "statistics" ? (
                  <StatisticsManager initial={statistics} />
                ) : (
                  <div className="actions" data-action-row="">
                    {kind === "team" ? (
                      <TeamEditor slug="synthetic" version={4} team={team} />
                    ) : kind === "referee" ? (
                      <RefereeAssignment
                        slug="synthetic"
                        fixture={fixture}
                        data={refereeData}
                      />
                    ) : (
                      <ConfirmMutation
                        label={
                          kind === "switch"
                            ? "Publish pool"
                            : "Refresh selected metadata"
                        }
                        title="Confirm action"
                        loadingFeedback={
                          kind === "region" ? "region" : "button"
                        }
                        requireConfirmation={
                          !["region", "direct", "async"].includes(kind)
                        }
                        icon={
                          kind === "icon" ? (
                            <MappoolActionIcon kind="refresh" />
                          ) : undefined
                        }
                        switchChecked={kind === "switch" ? false : undefined}
                        url="/api/synthetic/action"
                        payload={{
                          action: "refresh",
                          expectedVersion: 4,
                          confirmed: true,
                        }}
                        onSuccess={
                          kind === "async"
                            ? async () => {
                                await fetch("/synthetic-post-save");
                              }
                            : undefined
                        }
                      />
                    )}
                    <button
                      className="secondary"
                      data-sibling=""
                      onClick={() => setSiblingClicks((n) => n + 1)}
                    >
                      Sibling action
                    </button>
                    <output>{siblingClicks}</output>
                  </div>
                )}
              </main>
            </Suspense>
          </StaffReadOnlyContext>
        </NextIntlClientProvider>
      </SearchParamsContext.Provider>
    </AppRouterContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
