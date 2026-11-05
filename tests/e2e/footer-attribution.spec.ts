import { test, expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";
import { seedBrowserEditions } from "./setup";
import {
  closeHeaderPreferences,
  openHeaderPreferences,
} from "./header-preferences";

const origin = "http://127.0.0.1:3100";
const sampledAppearances = ["default", "glacier-blue", "skyline-pop"] as const;
const credits = {
  en: "Touhou Project fan art · Cirno © Team Shanghai Alice / ZUN",
  "zh-Hans": "东方Project 二次创作 · 琪露诺 ©上海アリス幻樂団 / ZUN",
  "zh-Hant": "東方Project 二次創作 · 琪露諾 ©上海アリス幻樂団 / ZUN",
};

test.describe("S9 footer attribution scope", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.beforeEach(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, site_settings, site_setting_events CASCADE`,
    );
    await seedEditions([
      { ...edition, slug: "s9", defaultAppearance: "default" },
      ...sampledAppearances.map((appearance) => ({
        ...edition,
        slug: `footer-${appearance}`,
        defaultAppearance: appearance,
      })),
    ]);
  });
  test.afterEach(async () => {
    await db().execute(sql`TRUNCATE edition_state CASCADE`);
    await seedBrowserEditions();
  });
  test.afterAll(closeDb);

  const locale = "en";
  const theme = "light";
  test(`${locale} ${theme}: follows the active theme on load, refresh and navigation`, async ({
    page,
    context,
    browser,
    isMobile,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({
      width: isMobile ? 320 : 1440,
      height: 844,
    });
    const cookies = [
      { name: "oclr-locale", value: locale, url: origin },
      { name: "oclr-theme", value: theme, url: origin },
    ];
    await context.addCookies(cookies);
    const credit = page.locator(".glacier-attribution");

    // A fresh default page must work without ever requesting S9 CSS.
    await page.goto("/privacy");
    await expect(credit).toBeHidden();
    await expect(
      page.locator('link[data-oclr-appearance-style="glacier-blue"]'),
    ).toHaveCount(0);
    await context.addCookies([
      { name: "oclr-appearance", value: "glacier-blue", url: origin },
    ]);
    await page.goto("/tournaments/s9");
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "default",
    );
    await expect(credit).toBeHidden();

    // Exercise the actual production bundles, one optional stylesheet per load.
    for (const appearance of sampledAppearances) {
      await page.goto(`/tournaments/footer-${appearance}`);
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance",
        appearance,
      );
      await expect(credit).toHaveText(credits[locale]);
      if (appearance === "glacier-blue") await expect(credit).toBeVisible();
      else await expect(credit).toBeHidden();
    }

    // SSR visibility also holds before hydration or without JavaScript.
    const noJs = await browser.newContext({
      javaScriptEnabled: false,
      viewport: page.viewportSize(),
    });
    try {
      await noJs.addCookies(cookies);
      const serverPage = await noJs.newPage();

      for (const appearance of ["default", "glacier-blue"]) {
        await serverPage.goto(`${origin}/tournaments/footer-${appearance}`);
        if (appearance === "glacier-blue")
          await expect(
            serverPage.locator(".glacier-attribution"),
          ).toBeVisible();
        else
          await expect(serverPage.locator(".glacier-attribution")).toBeHidden();
      }
    } finally {
      await noJs.close();
    }

    await page.goto("/tournaments/footer-glacier-blue");
    const choose = async (appearance: string) => {
      await openHeaderPreferences(page);
      await page.locator(".appearance-trigger").click();
      await page.locator(`[data-appearance-option="${appearance}"]`).click();
    };
    await choose("default");
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "default",
    );
    await expect(credit).toBeHidden();
    await page.reload();
    await expect(credit).toBeHidden();
    await choose("site");
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "glacier-blue",
    );
    await expect(credit).toBeVisible();
    await closeHeaderPreferences(page);
    // Follow real Next links so the root layout and loaded S9 sheet persist.
    await page.locator('a[href="/"]').first().click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "default",
    );
    await expect(credit).toBeHidden();
    await page
      .locator('a[href="/tournaments/footer-glacier-blue"]')
      .first()
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "glacier-blue",
    );
    await expect(credit).toBeVisible();
    await page.reload();
    await expect(credit).toBeVisible();
    await page.goto("/privacy");
    await expect(credit).toBeHidden();
    await expect(page.locator(".site-footer")).toContainText("OCLR Dev Team.");
    await expect(page.locator(".footer-actions a")).toHaveCount(2);
  });
});
