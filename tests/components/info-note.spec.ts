import { test, expect } from "@playwright/test";

test("player hint stays open while either focus or hover remains", async ({
  page,
}) => {
  await page.goto("/info-note");
  const outside = page.getByRole("button", { name: "Outside" });
  const hint = page.getByLabel("Player statistics explanation");
  const note = page.getByText("Team results use recorded scores.");
  await outside.focus();
  await outside.press("Shift+Tab");
  await expect(hint).toBeFocused();
  await expect(note).toBeVisible();
  const focusTop = await note.evaluate((element) => element.style.top);
  await hint.hover();
  await page.mouse.move(0, 0);
  await expect(hint).toBeFocused();
  await expect(note).toBeVisible();
  await expect(note).toHaveCSS("top", focusTop);

  await hint.hover();
  await hint.press("Tab");
  await expect(outside).toBeFocused();
  await expect(note).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(note).toBeHidden();
});
for (const theme of ["light", "dark"]) {
  test(`notes remain visible in separate boxes (${theme})`, async ({
    page,
  }) => {
    await page.goto("/info-note");
    await page
      .locator("html")
      .evaluate((el, value) => el.setAttribute("data-theme", value), theme);
    await expect(page.getByText("Supplementary explanation")).toBeVisible();
    await expect(page.getByText("Coverage details")).toBeVisible();
    await expect(page.getByRole("status")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Notes", exact: true }),
    ).toHaveCount(0);
    for (const note of await page.getByRole("note").all()) {
      const box = await note.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
    }
  });
}
