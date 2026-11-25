import { test, expect } from "@playwright/test";
import { syntheticAwardWorkspace } from "../fixtures/award-workspace";

for (const count of [2, 3]) {
  test(`removing selected week ${count} restores an existing report`, async ({
    page,
  }) => {
    let data = syntheticAwardWorkspace(count);
    const writes: Record<string, unknown>[] = [];
    await page.route("**/api/admin/tournaments/synthetic/awards", (route) => {
      const command = route.request().postDataJSON();
      writes.push(command);
      data = {
        ...data,
        weeks: command.weeks,
        version: data.version + 1,
        reports: data.reports.filter((report) =>
          command.weeks.some(
            (week: { number: number }) => week.number === report.number,
          ),
        ),
      };
      return route.fulfill({ json: data });
    });
    await page.goto(`/award-manager?weeks=${count}`);
    const review = page.getByRole("combobox", { name: "Review week" });
    await review.selectOption(String(count));
    await expect(page.locator(".award-table")).toHaveCount(1);
    await page.getByText("Weeks and player Tiers", { exact: true }).click();
    await page.getByRole("button", { name: "Remove last week" }).click();
    await page
      .getByRole("button", { name: "Save configuration" })
      .press("Enter");
    await expect(
      page.getByRole("status").filter({ hasText: "Saved." }),
    ).toBeVisible();
    expect(writes[0]).toMatchObject({
      action: "configure",
      expectedVersion: 1,
    });
    expect(data.weeks).toHaveLength(count - 1);
    await expect(review).toHaveValue("1");
    await expect(page.locator(".award-table")).toHaveCount(1);
    await expect(
      page.getByText("Configure award weeks before reviewing results.", {
        exact: true,
      }),
    ).toHaveCount(0);
  });
}

test("keeps a valid review week and retains it on a failed save, then handles no weeks", async ({
  page,
}) => {
  let data = syntheticAwardWorkspace(3);
  let fail = true;
  await page.route("**/api/admin/tournaments/synthetic/awards", (route) => {
    if (fail)
      return route.fulfill({
        status: 409,
        json: { error: "Award configuration changed. Refresh before saving." },
      });
    const command = route.request().postDataJSON();
    data = {
      ...data,
      weeks: command.weeks,
      version: data.version + 1,
      reports: data.reports.filter((report) =>
        command.weeks.some(
          (week: { number: number }) => week.number === report.number,
        ),
      ),
    };
    return route.fulfill({ json: data });
  });
  await page.goto("/award-manager?weeks=3");
  const review = page.getByRole("combobox", { name: "Review week" });
  await review.selectOption("2");
  await page.getByText("Weeks and player Tiers", { exact: true }).click();
  const remove = page.getByRole("button", { name: "Remove last week" });
  const save = page.getByRole("button", { name: "Save configuration" });
  await remove.click();
  await save.press("Enter");
  await expect(page.getByRole("alert")).toHaveText(
    "Award configuration changed. Refresh before saving.",
  );
  await expect(review).toHaveValue("2");
  await expect(page.locator(".award-table")).toHaveCount(1);
  fail = false;
  await save.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved." }),
  ).toBeVisible();
  await expect(review).toHaveValue("2");
  await expect(page.locator(".award-table")).toHaveCount(1);
  await remove.click();
  await remove.click();
  await save.press("Enter");
  await expect(review.locator("option")).toHaveCount(0);
  await expect(page.locator(".award-table")).toHaveCount(0);
  await expect(
    page.getByText("Configure award weeks before reviewing results.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("keeps the configuration draft when unpublishing an award", async ({
  page,
}) => {
  const data = syntheticAwardWorkspace(2);
  const report = data.reports[0];
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/admin/tournaments/synthetic/awards", (route) => {
    const command = route.request().postDataJSON();
    writes.push(command);
    return route.fulfill({
      json: {
        ...data,
        version: data.version + writes.length,
        policy: command.policy ?? data.policy,
        weeks: command.weeks ?? data.weeks,
        releases:
          command.action === "publish"
            ? [
                {
                  id: "release-1",
                  week: report.number,
                  fingerprint: report.fingerprint,
                },
              ]
            : [],
      },
    });
  });
  await page.goto("/award-manager?weeks=2");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Approve & publish" }).press("Enter");
  await expect(page.getByText("Published", { exact: true })).toBeVisible();

  await page.getByText("Weeks and player Tiers", { exact: true }).click();
  const policy = page.getByRole("combobox", { name: "Rating policy" });
  await policy.selectOption("yumu-mra-v1");
  await page.getByRole("button", { name: "Remove last week" }).click();
  await page.getByRole("button", { name: "Unpublish" }).press("Enter");
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await expect(policy).toHaveValue("yumu-mra-v1");
  await expect(page.getByRole("group", { name: "Week 2" })).toHaveCount(0);

  const save = page.getByRole("button", { name: "Save configuration" });
  await expect(save).toBeEnabled();
  await save.press("Enter");
  await expect(save).toBeDisabled();
  expect(writes[2]).toMatchObject({
    action: "configure",
    expectedVersion: 3,
    policy: "yumu-mra-v1",
    weeks: data.weeks.slice(0, 1),
  });
});
