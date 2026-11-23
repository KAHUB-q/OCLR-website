import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PickemPlayerPage } from "../../src/components/pickem-player-page";

vi.mock("@/lib/auth/user", () => ({
  localBrowserUser: async () => ({ osuId: 1 }),
}));
vi.mock("@/lib/data-source", () => ({ remoteMode: () => false }));
vi.mock("@/i18n/server", () => ({
  getAppTranslations: async () =>
    Object.assign((message: string) => message, { locale: "en" }),
}));
vi.mock("../../src/components/pickem-match-card", () => ({
  PickemMatchCard: ({ card }: { card: { label: string } }) => (
    <p>{card.label}</p>
  ),
}));
vi.mock("@/lib/pickem", () => ({
  pickemRead: async () => {
    const round = { id: "round", name: "Round A" };
    return {
      rounds: [round],
      selectedRound: round,
      cards: Array.from({ length: 26 }, (_, i) => ({
        windowId: String(i),
        fixtureId: String(i),
        roundId: round.id,
        label: `Match ${i + 1}`,
        status: i === 25 ? "closed" : "open",
        closesAt: "2026-12-01T00:00:00Z",
        timeZone: "UTC",
        home: { name: "Home" },
        mine: i === 0 ? { outcomeKey: "home", score: null } : null,
      })),
      myScore: { points: 0 },
      seasonScore: { points: 0 },
      leaderboard: [],
      seasonLeaderboard: Array.from({ length: 51 }, (_, i) => ({
        username: `Player ${i + 1}`,
        position: i + 1,
        points: 0,
        exact: 0,
        settled: 1,
        correct: 0,
      })),
    };
  },
}));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "unused-in-page-test");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function render(
  view: "mine" | "matches" | "leaderboard",
  query: Record<string, string>,
) {
  return renderToStaticMarkup(
    await PickemPlayerPage({ slug: "cup", view, query }),
  );
}

it("shows the remaining open matches when the last match on page two closes", async () => {
  const html = await render("matches", { status: "open", cursor: "25" });
  expect(html).toContain(">Match 1<");
  expect(html).toContain(">Match 25<");
  expect(html).not.toContain(">Match 26<");
  expect(html).not.toContain('aria-label="Pagination"');
});

it("shows the player's saved prediction for an expired history offset", async () => {
  const html = await render("mine", { cursor: "25" });
  expect(html).toContain(">Match 1<");
  expect(html).not.toContain("You have not made a prediction yet.");
  expect(html).not.toContain('aria-label="Pagination"');
});

it("uses the actual last leaderboard page to build the previous link", async () => {
  const html = await render("leaderboard", { cursor: "100000" });
  expect(html).toContain(">Player 51<");
  expect(html).not.toContain(">Player 50<");
  expect(html).toContain('scope=season&amp;cursor=25">Previous</a>');
  expect(html).not.toContain(">Next</a>");
});

it("keeps both adjacent links for a valid middle page", async () => {
  const html = await render("leaderboard", { cursor: "25" });
  expect(html).toContain(">Player 26<");
  expect(html).toContain(">Player 50<");
  expect(html).toContain('cursor=0">Previous</a>');
  expect(html).toContain('cursor=50">Next</a>');
});

it("keeps the empty state without pagination when no matches qualify", async () => {
  const html = await render("matches", { status: "settled", cursor: "25" });
  expect(html).toContain("No matches match these filters.");
  expect(html).not.toContain('aria-label="Pagination"');
});

it("preserves an in-range offset between page boundaries", async () => {
  const html = await render("leaderboard", { cursor: "49" });
  expect(html).toContain(">Player 50<");
  expect(html).toContain(">Player 51<");
  expect(html).not.toContain(">Player 49<");
  expect(html).toContain('cursor=24">Previous</a>');
});
