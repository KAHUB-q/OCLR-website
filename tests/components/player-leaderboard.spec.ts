import { expect, test } from "@playwright/test";

for (const reset of [false, true]) {
  test(`MRA changes direction on the first click after ${reset ? "resetting another sort" : "opening the leaderboard"}`, async ({
    page,
  }) => {
    await page.route("https://a.ppy.sh/**", (route) => route.abort());
    await page.goto("/player-leaderboard");
    const cards = page.locator('[aria-label^="#"]');
    const mra = page
      .getByRole("toolbar")
      .getByRole("button", { name: "MRA v4", exact: true });
    const pp = page
      .getByRole("toolbar")
      .getByRole("button", { name: "pp", exact: true });
    await expect(cards).toHaveCount(3);
    await expect(mra).toHaveAccessibleDescription("Sorted descending");
    await expect(cards.first()).toHaveAttribute("aria-label", "#1 Synthetic 3");
    if (reset) {
      await pp.click();
      await pp.click();
      await expect(cards.first()).toHaveAttribute(
        "aria-label",
        "#3 Synthetic 1",
      );
      await pp.click();
      await expect(mra).toHaveAttribute("aria-pressed", "true");
      await expect(mra).toHaveAccessibleDescription("Sorted descending");
      await expect(pp).toHaveAccessibleDescription("");
      await expect(cards.first()).toHaveAttribute(
        "aria-label",
        "#1 Synthetic 3",
      );
    }
    await mra.click();
    await expect(cards.first()).toHaveAttribute("aria-label", "#3 Synthetic 1");
    await mra.click();
    await expect(cards.first()).toHaveAttribute("aria-label", "#1 Synthetic 3");
    // Selecting MRA from a different active column still starts descending.
    await pp.click();
    await pp.click();
    await expect(cards.first()).toHaveAttribute("aria-label", "#3 Synthetic 1");
    await mra.click();
    await expect(cards.first()).toHaveAttribute("aria-label", "#1 Synthetic 3");
    await mra.focus();
    await page.keyboard.press("Enter");
    await expect(mra).toBeFocused();
    await expect(mra).toHaveAccessibleDescription("Sorted ascending");
    await expect(cards.first()).toHaveAttribute("aria-label", "#3 Synthetic 1");
  });
}

test("beatmap sort controls expose the direction of the displayed order", async ({
  page,
}) => {
  await page.goto("/player-leaderboard?board=beatmap");
  const picks = page.getByRole("button", { name: "Picks", exact: true });
  const plays = page.getByRole("button", { name: "Plays", exact: true });
  const first = page
    .getByRole("region", { name: /^#\d+ Synthetic map/ })
    .first();
  await expect(picks).toHaveAccessibleDescription("Sorted descending");
  await expect(first).toHaveAccessibleName("#1 Synthetic map 3");
  await picks.press("Enter");
  await expect(picks).toHaveAccessibleDescription("Sorted ascending");
  await expect(first).toHaveAccessibleName("#2 Synthetic map 1");
  await plays.press("Enter");
  await expect(plays).toHaveAccessibleDescription("Sorted descending");
  await expect(picks).toHaveAccessibleDescription("");
  await expect(first).toHaveAccessibleName("#1 Synthetic map 3");
});
