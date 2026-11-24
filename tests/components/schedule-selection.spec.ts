import { test, expect, type Page } from "@playwright/test";

async function selectRange(page: Page, mobile: boolean) {
  const calendar = page.locator(".schedule-calendar-root");
  await calendar.waitFor();
  await calendar.scrollIntoViewIfNeeded();
  const lane = page.locator('.schedule-day-lane[data-date="2026-11-01"]');
  const box = await lane.boundingBox();
  expect(box).toBeTruthy();
  const x = box!.x + box!.width / 2,
    y = box!.y + (box!.height * 20) / 24;
  if (mobile) {
    const touch = await page.context().newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await page.waitForTimeout(1100); // FullCalendar's actual long-press selection gesture.
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + box!.height / 24 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + box!.height / 24, { steps: 12 });
    await page.mouse.up();
  }
}
async function fillRange(page: Page, end = "22:00", start = "20:00") {
  await page
    .getByLabel("Available from: date", { exact: true })
    .fill("2026-11-01");
  await page
    .getByLabel("Available from: time (HH:mm)", { exact: true })
    .fill(start);
  await page
    .getByLabel("Available until: date", { exact: true })
    .fill("2026-11-01");
  await page
    .getByLabel("Available until: time (HH:mm)", { exact: true })
    .fill(end);
}

test("removing an earlier slot keeps the edit on the same interval through save", async ({
  page,
}) => {
  await page.goto("/schedule-selection?fixture");
  const add = page.getByRole("button", { name: "Add time slot", exact: true });
  const rows = page.locator(".schedule-slots li");
  await fillRange(page, "21:00");
  await add.click();
  await fillRange(page, "23:00", "22:00");
  await add.click();
  await rows.nth(1).getByRole("button", { name: "Edit" }).click();
  const end = page.getByLabel("Available until: time (HH:mm)", { exact: true });
  await end.fill("21:30");
  await rows.first().getByRole("button", { name: "Remove" }).click();

  await expect(end).toHaveValue("21:30");
  await expect(page.locator(".schedule-selection")).toHaveCount(1);
  await page.getByRole("button", { name: "Update time slot" }).click();

  const writes: unknown[] = [];
  await page.route(
    "**/api/tournaments/synthetic/schedule/requests",
    (route) => {
      if (route.request().method() === "POST") {
        writes.push(route.request().postDataJSON());
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ json: { fixtures: [], requests: [] } });
    },
  );
  await page.getByRole("button", { name: "Save availability" }).click();
  await expect
    .poll(() => writes)
    .toEqual([
      expect.objectContaining({
        action: "availability",
        intervals: [
          {
            start: "2026-11-01T12:00:00.000Z",
            end: "2026-11-01T13:30:00.000Z",
          },
          {
            start: "2026-11-01T14:00:00.000Z",
            end: "2026-11-01T15:00:00.000Z",
          },
        ],
      }),
    ]);
});

test("removing a later slot keeps the draft until the edited slot is removed", async ({
  page,
}) => {
  await page.goto("/schedule-selection?fixture");
  const rows = page.locator(".schedule-slots li");
  const add = page.getByRole("button", { name: "Add time slot", exact: true });
  await fillRange(page);
  await add.click();
  await rows.first().getByRole("button", { name: "Edit" }).click();
  const end = page.getByLabel("Available until: time (HH:mm)", { exact: true });
  await end.fill("19:30");
  await rows.last().getByRole("button", { name: "Remove" }).click();
  await expect(end).toHaveValue("19:30");
  await expect(
    page.getByRole("button", { name: "Update time slot" }),
  ).toBeEnabled();
  await rows.first().getByRole("button", { name: "Remove" }).click();
  await expect(end).toHaveValue("");
  await expect(add).toBeDisabled();
  await expect(page.locator(".schedule-selection")).toHaveCount(0);
});

test("a new slot can still be added after removing an existing slot", async ({
  page,
}) => {
  await page.goto("/schedule-selection?fixture");
  await fillRange(page);
  const rows = page.locator(".schedule-slots li");
  await rows.first().getByRole("button", { name: "Remove" }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.locator(".schedule-selection")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Add time slot", exact: true })
    .click();
  await expect(rows).toHaveCount(1);
  await rows.first().getByRole("button", { name: "Edit" }).click();
  await expect(
    page.getByLabel("Available from: time (HH:mm)", { exact: true }),
  ).toHaveValue("20:00");
  await expect(
    page.getByLabel("Available until: time (HH:mm)", { exact: true }),
  ).toHaveValue("22:00");
});

for (const theme of ["light", "dark"]) {
  test(`${theme}: fixture selection and edited ranges stay visible without saving`, async ({
    page,
    isMobile,
  }) => {
    await page.goto(`/schedule-selection?fixture&theme=${theme}`);
    await selectRange(page, isMobile);
    await expect(page.locator(".schedule-own")).toHaveCount(2);
    await fillRange(page);
    await expect(page.locator(".schedule-selection")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Add time slot", exact: true })
      .click();
    await expect(page.locator(".schedule-selection")).toHaveCount(0);
    await expect(page.locator(".schedule-own")).toHaveCount(3);
    await page
      .locator(".schedule-slots li")
      .first()
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await expect(page.locator(".schedule-selection")).toHaveCount(1);
    await expect(page.locator(".schedule-own")).toHaveCount(2);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator(".schedule-selection")).toHaveCount(0);
    await expect(page.locator(".schedule-own")).toHaveCount(3);
    await expect(page.locator(".schedule-official")).toHaveCount(1);
  });
}
