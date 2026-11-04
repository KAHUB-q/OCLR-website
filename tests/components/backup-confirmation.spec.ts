import { test, expect } from "@playwright/test";

test("requires fresh confirmation after cancel, switching targets, or reopening the same backup", async ({
  page,
}) => {
  const posts: string[] = [];
  await page.route("**/api/admin/backups**", async (route) => {
    if (route.request().method() === "POST") posts.push(route.request().url());
    await route.fulfill({
      json: ["a", "b"].map((id) => ({
        id: `backup-${id}`,
        state: "validated",
        action: "import",
        target: `Synthetic target ${id}`,
        createdAt: "2026-11-01T00:00:00Z",
        manifest: {
          createdAt: "2026-11-01T00:00:00Z",
          source: `Synthetic source ${id}`,
          release: "synthetic",
          schema: "synthetic",
        },
      })),
    });
  });
  await page.goto("/backup-manager");
  const review = (id: string) =>
    page
      .getByRole("listitem")
      .filter({ hasText: `backup-${id}` })
      .getByRole("button", { name: "Review restore" });
  const input = page.getByRole("textbox", { name: "REPLACE", exact: true });
  const confirm = page.getByRole("button", {
    name: "Confirm restore",
    exact: true,
  });
  await review("a").click();
  await expect(confirm).toBeDisabled();
  await input.fill("REPLACE");
  await expect(confirm).toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await review("b").click();
  await expect(
    page.getByText("Synthetic target b", { exact: true }),
  ).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(confirm).toBeDisabled();
  await input.fill("REPLACE");
  await review("a").click();
  await expect(input).toHaveValue("");
  await expect(confirm).toBeDisabled();
  await input.fill("REPLACE");
  await review("a").click();
  await expect(input).toHaveValue("");
  await expect(confirm).toBeDisabled();
  await input.fill("REPLACE");
  await expect(confirm).toBeEnabled();
  expect(posts).toEqual([]);
});
