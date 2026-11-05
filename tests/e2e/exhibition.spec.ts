import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { mappoolEntries, mappools } from "../../src/db/schema";
import { seedSession } from "./session";
import { seedBrowserEditions } from "./setup";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
import { assertTestDatabase } from "../database";
const origin = "http://127.0.0.1:3100";
test.describe("exhibition round and historical pool selection", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.beforeEach(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
  });
  test.afterEach(seedBrowserEditions);
  test.afterAll(closeDb);
  test("creates an exhibition, selects past maps, preserves provenance and exposes published exhibition pools", async ({
    page,
    context,
    isMobile,
  }) => {
    test.setTimeout(120000);
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await seedEditions(
      [
        {
          ...edition,
          slug: "past-exhibition-test",
          name: "Synthetic Exhibition History",
          status: "completed",
          registration: null,
          archive: {
            ...historicalArchive,
            editionSlug: "past-exhibition-test",
            pools: [
              {
                ...historicalArchive.pools[0],
                maps: [
                  { ...historicalArchive.pools[0].maps[0], beatmapId: 123 },
                ],
              },
            ],
          },
        },
      ],
      false,
    );
    await page.goto("/admin/tournaments/test-cup/rounds");
    await page.getByRole("tab", { name: "Exhibition", exact: true }).click();
    await expect(
      page.getByText(
        "Exhibition results are excluded from official tournament results, career records, ratings and awards.",
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "+ New round", exact: true })
      .click();
    await page
      .getByLabel("Round name", { exact: true })
      .fill("Synthetic Showmatch");
    await page
      .getByRole("button", { name: "Create round", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic Showmatch", exact: true }),
    ).toBeVisible();
    await page.goto("/admin/tournaments/test-cup/mappools");
    await page.getByRole("tab", { name: "Exhibition", exact: true }).click();
    await page.getByRole("button", { name: "+ New pool", exact: true }).click();
    await page
      .getByLabel("New pool name", { exact: true })
      .fill("Synthetic History Selection");
    await page
      .getByRole("button", { name: "Create draft pool", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: /Synthetic History Selection/ }),
    ).toBeVisible();
    const chooser = page.locator("details").filter({
      has: page.locator("summary", {
        hasText: "Choose from historical mappools",
      }),
    });
    await chooser.locator("summary").click();
    await chooser
      .getByLabel("Source tournament")
      .selectOption("past-exhibition-test");
    await chooser
      .getByRole("button", { name: "Select all visible maps", exact: true })
      .click();
    await expect(chooser.getByRole("checkbox")).toBeChecked();
    await chooser
      .getByRole("button", { name: "Add selected maps", exact: true })
      .click();
    await expect(
      page.getByText("Historical maps added.", { exact: true }),
    ).toBeVisible();
    const [saved] = await db()
      .select()
      .from(mappools)
      .where(eq(mappools.name, "Synthetic History Selection"));
    const entries = await db()
      .select()
      .from(mappoolEntries)
      .where(eq(mappoolEntries.poolId, saved.id));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      category: "NM",
      position: 1,
      beatmapId: 123,
      source: { editionSlug: "past-exhibition-test", slot: "NM1" },
    });
    await expect(
      page.getByText(/Historical source: Synthetic Exhibition History/),
    ).toBeVisible();
    const publish = await context.request.post(
      "/api/admin/tournaments/test-cup/mappools",
      {
        headers: { origin },
        data: {
          action: "pool_publish",
          poolId: saved.id,
          expectedVersion: saved.version,
          published: true,
          confirmed: true,
        },
      },
    );
    expect(publish.status()).toBe(200);
    await page.goto("/tournaments/test-cup/mappools");
    await expect(page.getByText(/Exhibition/).first()).toBeVisible();
    await expect(
      page.getByText("Synthetic Browser Song", { exact: false }).first(),
    ).toBeVisible();
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"]) {
        await context.addCookies(
          [
            ["oclr-locale", locale],
            ["oclr-theme", theme],
          ].map(([name, value]) => ({ name, value, url: origin })),
        );
        await page.setViewportSize({
          width: isMobile ? 320 : 1440,
          height: 900,
        });
        await page.goto("/admin/tournaments/test-cup/mappools");
        await page
          .getByRole("tab", {
            name:
              locale === "en"
                ? "Exhibition"
                : locale === "zh-Hans"
                  ? "表演赛"
                  : "表演賽",
            exact: true,
          })
          .click();
        await page.locator("details.mappool-setup summary").click();
        await expect(
          page.locator("details.mappool-setup select").first(),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (locale === "en")
          expect(
            (
              await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze()
            ).violations,
          ).toEqual([]);
      }
  });
});
