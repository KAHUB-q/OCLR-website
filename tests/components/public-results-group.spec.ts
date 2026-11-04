import { test, expect } from "@playwright/test";
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
