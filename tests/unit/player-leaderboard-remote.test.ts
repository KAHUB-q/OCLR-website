import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  version: "1.24.0",
  resource: vi.fn(),
  database: vi.fn(),
}));
vi.mock("../../src/lib/data-source", () => ({ remoteMode: () => true }));
vi.mock("../../src/lib/frontend-data", () => ({
  frontendConnection: async () => ({ contractVersion: state.version }),
}));
vi.mock("../../src/lib/frontend-resource", () => ({
  frontendResource: state.resource,
}));
vi.mock("../../src/db", () => ({
  db: state.database,
  readOnlyData: state.database,
}));
vi.mock("../../src/lib/content", () => ({ getPublicEditions: async () => [] }));
import {
  playerLeaderboard,
  publicPlayerMra,
} from "../../src/lib/player-leaderboard";
import {
  beatmapLeaderboard,
  careerLeaderboard,
} from "../../src/lib/saved-rankings";
import { publicSeasonSeries } from "../../src/lib/ratings";
import { supportsProfileRatings } from "../../src/lib/read-api-version";
describe("background ranking remote adapter", () => {
  beforeEach(() => {
    state.resource.mockReset();
    state.database.mockReset();
    state.version = "1.24.0";
  });
  it("reads the saved full and personal resources without a local database", async () => {
    state.resource.mockResolvedValueOnce({
      players: [{ osuId: 42, username: "Latest public ID", mra: 1.25 }],
      editions: 1,
      unavailableEditions: 0,
      maps: 2,
      skippedMaps: 0,
      art: { "42": { avatarUrl: null, coverUrl: null } },
      state: "ready",
      calculatedAt: "2026-11-06T00:00:00Z",
    });
    const full = await playerLeaderboard();
    expect(full.players).toEqual([
      { osuId: 42, username: "Latest public ID", mra: 1.25 },
    ]);
    expect(full.art.get(42)).toEqual({ avatarUrl: null, coverUrl: null });
    expect(state.resource).toHaveBeenCalledWith("playerLeaderboard");
    state.resource.mockResolvedValueOnce({
      mra: 1.25,
      state: "ready",
      calculatedAt: "2026-11-06T00:00:00Z",
    });
    expect((await publicPlayerMra(42)).mra).toBe(1.25);
    expect(state.resource).toHaveBeenLastCalledWith("publicPlayerMra", {
      osuId: 42,
    });
    expect(state.database).not.toHaveBeenCalled();
  });
  it("requires the saved career and beatmap resources for the new ranking pages", async () => {
    state.version = "1.34.0";
    expect(await careerLeaderboard()).toMatchObject({
      state: "pending",
      players: [],
    });
    expect(await beatmapLeaderboard()).toMatchObject({
      state: "pending",
      maps: [],
    });
    expect(state.resource).not.toHaveBeenCalled();
    state.version = "1.35.0";
    state.resource
      .mockResolvedValueOnce({ state: "ready", players: [] })
      .mockResolvedValueOnce({ state: "ready", maps: [] });
    expect(await careerLeaderboard()).toMatchObject({
      state: "ready",
      players: [],
    });
    expect(await beatmapLeaderboard()).toMatchObject({
      state: "ready",
      maps: [],
    });
    expect(state.resource.mock.calls).toEqual([
      ["careerLeaderboard"],
      ["beatmapLeaderboard"],
    ]);
    expect(state.database).not.toHaveBeenCalled();
  });
  it("keeps profile ratings on 1.39 and requests season Series starting with 1.40", async () => {
    state.version = "1.39.0";
    expect(supportsProfileRatings(state.version)).toBe(true);
    expect(await publicSeasonSeries("s8")).toBeNull();
    expect(state.resource).not.toHaveBeenCalled();

    state.version = "1.40.0";
    const series = { fixtures: [], teams: [], players: [], games: [] };
    state.resource.mockResolvedValueOnce(series);
    expect(await publicSeasonSeries("s8")).toEqual(series);
    expect(state.resource).toHaveBeenCalledExactlyOnceWith(
      "publicSeasonSeries",
      {
        slug: "s8",
      },
    );
    expect(state.database).not.toHaveBeenCalled();
  });
  it("keeps the legacy public-score compatibility path for older v1 backends", async () => {
    state.version = "1.23.0";
    expect(await playerLeaderboard()).toMatchObject({
      players: [],
      state: "ready",
      calculatedAt: null,
    });
    expect(state.resource).not.toHaveBeenCalled();
    expect(state.database).not.toHaveBeenCalled();
  });
});
