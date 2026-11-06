import { test, expect, type Page } from "@playwright/test";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function openForm(page: Page, editing: boolean) {
  await page.goto("/fixture-manager");
  if (editing) {
    await page
      .getByRole("article", { name: "Synthetic target", exact: true })
      .getByRole("button", { name: "Manage fixture", exact: true })
      .click();
  } else {
    await page
      .getByRole("button", { name: "Create a fixture", exact: true })
      .click();
    await page
      .getByLabel("Fixture label", { exact: true })
      .fill("Synthetic new fixture");
    await page
      .getByRole("combobox", { name: "Home bracket source", exact: true })
      .selectOption(id(100));
    await page
      .getByRole("combobox", { name: "Away bracket source", exact: true })
      .selectOption(id(100));
    await page
      .getByRole("combobox", { name: "Away source outcome", exact: true })
      .selectOption("loser");
  }
}

for (const editing of [false, true]) {
  for (const stage of ["group", "exhibition", "knockout"] as const) {
    test(`${editing ? "edit" : "create"}: ${stage} submits only applicable progression sources`, async ({
      page,
    }) => {
      let submitted: Record<string, unknown> | undefined;
      await page.route(
        "**/api/admin/tournaments/synthetic/matches",
        async (route) => {
          submitted = route.request().postDataJSON();
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
          });
        },
      );
      await openForm(page, editing);
      await page
        .getByRole("combobox", { name: "Competition round", exact: true })
        .selectOption(id(stage === "exhibition" ? 3 : 2));
      await expect(
        page.getByRole("combobox", {
          name: "Home bracket source",
          exact: true,
        }),
      ).toHaveCount(0);
      if (stage === "knockout") {
        await page
          .getByRole("combobox", { name: "Competition round", exact: true })
          .selectOption(id(1));
        await expect(
          page.getByRole("combobox", {
            name: "Home bracket source",
            exact: true,
          }),
        ).toHaveValue(id(100));
        await expect(
          page.getByRole("combobox", {
            name: "Away source outcome",
            exact: true,
          }),
        ).toHaveValue("loser");
      }
      await page
        .getByRole("button", {
          name: editing ? "Save fixture amendment" : "Create fixture",
          exact: true,
        })
        .click();
      await expect.poll(() => submitted).toBeDefined();
      expect(submitted).toMatchObject({
        action: editing ? "edit" : "create",
        roundId: id(stage === "knockout" ? 1 : stage === "group" ? 2 : 3),
        homeSourceId: stage === "knockout" ? id(100) : null,
        homeSourceOutcome: stage === "knockout" ? "winner" : null,
        awaySourceId: stage === "knockout" ? id(100) : null,
        awaySourceOutcome: stage === "knockout" ? "loser" : null,
      });
    });
  }
}
