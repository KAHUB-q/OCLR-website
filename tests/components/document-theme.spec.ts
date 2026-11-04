import { test, expect } from "@playwright/test";
import { appearances } from "../../src/lib/preferences";
for (const appearance of appearances) {
  for (const theme of ["light", "dark"]) {
    test(`document palette follows ${appearance} ${theme}`, async ({
      page,
    }) => {
      await page.goto(`/header?appearance=${appearance}&theme=${theme}`);
      await expect(page.locator(".themed-site")).toBeVisible();
      const colors = await page.evaluate(() => {
        const html = getComputedStyle(document.documentElement);
        const body = getComputedStyle(document.body);
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--site-background)";
        probe.style.color = "var(--site-foreground)";
        document.body.append(probe);
        const expected = getComputedStyle(probe);
        const result = {
          scheme: html.colorScheme,
          background: body.backgroundColor,
          foreground: body.color,
          expectedBackground: expected.backgroundColor,
          expectedForeground: expected.color,
        };
        probe.remove();
        return result;
      });
      expect(colors.scheme).toBe(theme);
      expect(colors.background).toBe(colors.expectedBackground);
      expect(colors.foreground).toBe(colors.expectedForeground);
    });
  }
}
test("broadcast transparency and native palette stay isolated", async ({
  page,
}) => {
  await page.goto("/header?theme=light&appearance=cute-pastel");
  const values = await page.evaluate(() => {
    const broadcast = document.createElement("div");
    broadcast.className = "broadcast-site";
    broadcast.dataset.broadcast = "true";
    broadcast.style.color = "var(--color-foreground)";
    document.body.append(broadcast);
    return {
      body: getComputedStyle(document.body).backgroundColor,
      scheme: getComputedStyle(document.documentElement).colorScheme,
      color: getComputedStyle(broadcast).color,
    };
  });
  expect(values).toEqual({
    body: "rgba(0, 0, 0, 0)",
    scheme: "normal",
    color: "rgb(244, 243, 252)",
  });
});
