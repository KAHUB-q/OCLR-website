import { test, expect } from "@playwright/test";

test("hamburger controls the whole player sidebar and preserves unsaved content", async ({
  page,
  isMobile,
}, info) => {
  for (const theme of ["light", "dark"]) {
    await page.goto(`/player-sidebar?theme=${theme}`);
    const toggle = page.locator(
      `[data-workspace-toggle="${isMobile ? "mobile" : "desktop"}"]`,
    );
    const sidebar = page.locator(".tournament-workspace > .sidebar");
    const content = page.locator(".workspace-main");
    await expect(toggle).toHaveAccessibleName("Menu");
    await expect(toggle).toHaveAttribute("aria-expanded", String(!isMobile));
    if (isMobile) await toggle.click();
    await expect(sidebar).toBeVisible();
    await expect(
      sidebar.getByRole("navigation", { name: "PLAYER WORKSPACE" }),
    ).toBeVisible();
    await expect(toggle).toHaveAttribute(
      "aria-controls",
      (await sidebar.getAttribute("id"))!,
    );
    const expandedWidth = (await content.boundingBox())!.width;
    const input = page.getByRole("textbox", { name: "Unsaved input" });
    await input.fill("A draft survives toggling");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(sidebar).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(input).toHaveValue("A draft survives toggling");
    if (!isMobile)
      expect((await content.boundingBox())!.width).toBeGreaterThan(
        expandedWidth + 180,
      );
    await page.keyboard.press("Tab");
    await expect(input).toBeFocused();
    await page.screenshot({ path: info.outputPath(`${theme}-collapsed.png`) });
    await toggle.click();
    await expect(sidebar).toBeVisible();
    await expect(input).toHaveValue("A draft survives toggling");
    await page.screenshot({ path: info.outputPath(`${theme}-expanded.png`) });
  }
});

test("player and captain navigation close the phone sidebar and Escape restores focus", async ({
  page,
  isMobile,
}) => {
  await page.goto("/player-sidebar?captain=1");
  const toggle = page.locator(
    `[data-workspace-toggle="${isMobile ? "mobile" : "desktop"}"]`,
  );
  const sidebar = page.locator(".tournament-workspace > .sidebar");
  for (const [name, suffix] of [
    ["Season timetable", "player/availability"],
    ["My team", "team"],
    ["Captain draft room", "draft/captain"],
    ["Practice sheet", "player/practice"],
  ]) {
    if (isMobile) await toggle.click();
    await sidebar.getByRole("link", { name, exact: true }).click();
    await expect(page.locator("[data-pathname]")).toHaveText(
      `/tournaments/s11/${suffix}`,
    );
    if (isMobile) {
      await expect(sidebar).toBeHidden();
      await expect(toggle).toBeFocused();
    } else {
      await expect(sidebar).toBeVisible();
    }
  }
  if (isMobile) {
    await toggle.click();
    await sidebar
      .getByRole("link", { name: "Practice sheet", exact: true })
      .focus();
    await page.keyboard.press("Escape");
    await expect(sidebar).toBeHidden();
    await expect(toggle).toBeFocused();
    await toggle.click();
    await page.keyboard.press("Escape");
    await expect(sidebar).toBeHidden();
  } else {
    await toggle.click();
    // An external client route change must preserve the desktop choice.
    await page.locator("[data-route-change]").click();
    await expect(page.locator("[data-pathname]")).toHaveText(
      "/tournaments/s11/player/availability",
    );
    await expect(sidebar).toBeHidden();
  }
});

test("breakpoints and localized long edition names keep controls reachable", async ({
  page,
}) => {
  for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/player-sidebar?locale=${locale}&longName=1`);
    const sidebar = page.locator(".tournament-workspace > .sidebar");
    const desktop = page.locator('[data-workspace-toggle="desktop"]');
    const phone = page.locator('[data-workspace-toggle="mobile"]');
    await desktop.click();
    await page.setViewportSize({ width: 320, height: 800 });
    await expect(sidebar).toBeHidden();
    await expect(phone).toHaveAccessibleName(/.+/);
    await phone.click();
    await expect(sidebar).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(sidebar).toBeHidden();
    await desktop.click();
    await expect(sidebar).toBeVisible();
  }
});

test("public navigation and broadcast views retain their existing layout", async ({
  page,
  isMobile,
}) => {
  for (const query of [
    "path=/tournaments/s11",
    "path=/tournaments/s11/draft&presenter=1",
    "path=/tournaments/s11/draft/overlay",
  ]) {
    await page.goto(`/player-sidebar?${query}`);
    await expect(page.locator("[data-workspace-toggle]")).toHaveCount(0);
    if (query.includes("/draft"))
      await expect(page.locator(".sidebar")).toBeHidden();
    else await expect(page.locator(".event-context")).toBeVisible();
  }
  await page.goto("/player-sidebar?captainOnly=1&path=/tournaments/s11/team");
  if (isMobile) await page.locator('[data-workspace-toggle="mobile"]').click();
  await expect(
    page.getByRole("navigation", { name: "CAPTAIN WORKSPACE" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "PLAYER WORKSPACE" }),
  ).toHaveCount(0);
});
