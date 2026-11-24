import { test, expect } from "@playwright/test";

test("exhibition results do not offer a group filter", async ({ page }) => {
  await page.goto("/public-results");
  const stages = page.getByRole("group", { name: "Competition stage" });
  await stages.getByRole("button", { name: "Exhibition", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Group", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".public-match-card h3")).toHaveText(
    "Exhibition rematch",
  );
});

test("changing rounds keeps a compatible group and clears it for knockout", async ({
  page,
}) => {
  await page.goto("/public-results");
  const round = page.getByRole("combobox", { name: "Competition round" });
  const group = page.getByRole("combobox", { name: "Group", exact: true });
  const matches = page.locator(".public-match-card h3");
  await group.selectOption("group-0");
  await round.selectOption("group-round");
  await expect(group).toHaveValue("group-0");
  await expect(matches).toHaveText("Group A match");

  await round.selectOption("knockout-round");
  await expect(matches).toHaveText("Knockout rematch");
  await expect(group).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("1 published fixture");

  await round.selectOption("");
  await expect(group).toHaveValue("");
  await expect(matches).toHaveCount(4);
});

test("group selection excludes same-team knockout and exhibition rematches in both views", async ({
  page,
}) => {
  await page.goto("/public-results");
  const cards = page.locator(".public-match-card");
  const group = page.getByRole("combobox", { name: "Group", exact: true });
  await expect(cards).toHaveCount(4);
  await group.selectOption("group-0");
  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole("heading")).toHaveText("Group A match");
  await expect(page.getByRole("status")).toHaveText("1 published fixture");
  await page.getByRole("button", { name: "Compact", exact: true }).click();
  await expect(
    page.locator('.public-match-list[data-view="compact"]'),
  ).toHaveCount(1);
  await expect(cards).toHaveCount(1);
  await group.selectOption("group-1");
  await expect(cards.getByRole("heading")).toHaveText("Group B match");
  await group.selectOption("");
  await expect(cards).toHaveCount(4);
  await page
    .getByRole("group", { name: "Competition stage" })
    .getByRole("button", { name: "Group Stage", exact: true })
    .click();
  await group.selectOption("group-0");
  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole("heading")).toHaveText("Group A match");
});
