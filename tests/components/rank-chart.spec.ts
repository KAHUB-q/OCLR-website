import { test, expect } from "@playwright/test";

test("the selected rank stays readable when scrolling to either viewport edge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 200 });
  await page.goto("/rank-chart?gaps=one");
  const slider = page.getByRole("slider", { name: "Global rank" });
  await slider.focus();
  await slider.press("End");
  const tip = page.locator(".rank-chart-tip");
  await expect(tip).toContainText("Nov 4, 2026");
  const dot = page.locator(".rank-chart-dot");
  const inset = 12;
  for (const y of [inset, page.viewportSize()!.height - inset]) {
    const actualY = await dot.evaluate((el, targetY) => {
      const center = () => {
        const { top, bottom } = el.getBoundingClientRect();
        return (top + bottom) / 2;
      };
      window.scrollBy(0, center() - targetY);
      return center();
    }, y);
    expect(Math.abs(actualY - y)).toBeLessThan(2);
    await expect(tip).toBeInViewport({ ratio: 0.99 });
  }
});

test("keyboard users can inspect observed ranks and leave the chart", async ({
  page,
}) => {
  await page.goto("/rank-chart?gaps=one");
  const slider = page.getByRole("slider", { name: "Global rank" });
  const tip = page.locator(".rank-chart-tip");
  await expect(slider).toHaveCount(1);
  await slider.focus();
  await expect(tip).toContainText("Nov 4, 2026");
  await slider.press("Home");
  await expect(tip).toContainText("Nov 1, 2026");
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", /15,500.*Nov 3, 2026/);
  await expect(tip).toContainText("#15,500");
  await slider.press("End");
  await slider.press("ArrowRight");
  await expect(tip).toContainText("Nov 4, 2026");
  await slider.press("ArrowLeft");
  await expect(tip).toContainText("Nov 3, 2026");
  await slider.press("Tab");
  await expect(tip).toHaveCount(0);
  await page.keyboard.press("Shift+Tab");
  await expect(slider).toBeFocused();
  await expect(tip).toContainText("Nov 4, 2026");
});

test("unranked days retain the dates of earlier ranks", async ({ page }) => {
  for (const gaps of ["none", "one", "two", "trailing"]) {
    await page.goto(`/rank-chart?gaps=${gaps}`);
    const chart = page.locator(".rank-chart-svg");
    await expect(chart).toBeVisible();
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await expect(page.locator(".rank-chart-tip")).toContainText("#16,200");
    await expect(page.locator(".rank-chart-tip")).toContainText("Nov 1, 2026");
    await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
    await expect(page.locator(".rank-chart-tip")).toContainText("#15,000");
    await expect(page.locator(".rank-chart-tip")).toContainText("Nov 4, 2026");
  }
});
test("the shaded area ends with the last observed rank", async ({ page }) => {
  for (const unranked of [true, false]) {
    await page.goto(`/rank-chart?gaps=ended${unranked ? "&unranked" : ""}`);
    const chart = page.locator(".rank-chart-svg");
    await expect(chart).toBeVisible();
    const { lineEnd, fillEnd, plotEnd } = await chart.evaluate((svg) => {
      function rightEdge(selector: string) {
        const bounds = svg.querySelector<SVGPathElement>(selector)!.getBBox();
        return bounds.x + bounds.width;
      }
      const grid = svg.querySelector<SVGLineElement>(".rank-chart-grid")!;
      return {
        lineEnd: rightEdge(".rank-chart-line"),
        fillEnd: rightEdge(".rank-chart-area"),
        plotEnd: grid.x2.baseVal.value,
      };
    });
    expect(fillEnd).toBeCloseTo(lineEnd, 2);
    if (unranked) expect(lineEnd).toBeLessThan(plotEnd);
    else expect(lineEnd).toBeCloseTo(plotEnd, 2);
  }
});
test("equal ranks on two observed dates still show a trend", async ({
  page,
}) => {
  await page.goto("/rank-chart?gaps=flat");
  const chart = page.locator(".rank-chart-svg");
  await expect(chart).toBeVisible();
  const box = (await chart.boundingBox())!;
  for (const [x, date] of [
    [10, "Nov 1, 2026"],
    [box.width - 10, "Nov 4, 2026"],
  ] as const) {
    await page.mouse.move(box.x + x, box.y + box.height / 2);
    await expect(page.locator(".rank-chart-tip")).toContainText("#15,000");
    await expect(page.locator(".rank-chart-tip")).toContainText(date);
  }
});

test("a single rank date keeps the profile statistics in one column", async ({
  page,
}) => {
  for (const query of [
    "gaps=today",
    "gaps=trailing&unranked",
    "gaps=trailing&legacy",
    "gaps=empty",
  ]) {
    await page.goto(`/rank-chart?${query}`);
    await expect(
      page.locator(".profile-body--single .profile-statistics"),
    ).toBeVisible();
    await expect(page.locator(".rank-chart-card")).toHaveCount(0);
  }
});

test("snapshot dates stay fixed across midnight and repeated pointer visits", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-02T00:00:00Z"));
  await page.goto("/rank-chart");
  const chart = page.locator(".rank-chart-svg");
  await expect(chart).toBeVisible();
  const box = (await chart.boundingBox())!;
  const hover = () =>
    page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
  await hover();
  await expect(page.locator(".rank-chart-tip")).toContainText("Nov 1, 2026");
  await page.mouse.move(0, 0);
  await page.clock.setFixedTime(new Date("2026-11-04T00:00:00Z"));
  await hover();
  await expect(page.locator(".rank-chart-tip")).toContainText("Nov 1, 2026");
});
test("undated history shows ranks without inventing a calendar date", async ({
  page,
}) => {
  await page.goto("/rank-chart?undated");
  const chart = page.locator(".rank-chart-svg");
  await expect(chart).toBeVisible();
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
  await expect(page.locator(".rank-chart-tip")).toContainText("#12,345");
  await expect(page.locator(".rank-chart-tip span")).toHaveCount(0);
  await expect(
    page.getByRole("slider", { name: "Global rank" }),
  ).toHaveAttribute("aria-valuetext", "#12,345");
});
for (const theme of ["light", "dark"]) {
  test(`rank chart renders and inspects points (${theme})`, async ({
    page,
  }) => {
    await page.goto("/rank-chart");
    await page
      .locator("html")
      .evaluate((el, value) => el.setAttribute("data-theme", value), theme);
    const chart = page.locator(".rank-chart-svg");
    await expect(chart).toBeVisible();
    const line = page.locator(".rank-chart-line");
    await expect(line).toHaveAttribute("d", /^M[\d.]+ [\d.]+ L/);
    await expect(page.locator(".rank-chart-tip")).toHaveCount(0);
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const tip = page.locator(".rank-chart-tip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("#");
    // The tooltip must stay inside the viewport while hovering the edge.
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    const edge = (await tip.boundingBox())!;
    expect(edge.x).toBeGreaterThanOrEqual(0);
    expect(edge.x + edge.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.mouse.move(0, 0);
    await expect(page.locator(".rank-chart-tip")).toHaveCount(0);
  });
}
test("statistics sit beside the chart and stack on narrow screens", async ({
  page,
}) => {
  await page.goto("/rank-chart");
  const viewport = page.viewportSize()!;
  const body = page.locator(".profile-body");
  const columns = await body.evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns,
  );
  if (viewport.width >= 960) {
    expect(columns.split(" ")).toHaveLength(2);
    const chart = (await page.locator(".rank-chart-card").boundingBox())!;
    const stats = (await page.locator(".profile-statistics").boundingBox())!;
    expect(stats.x).toBeGreaterThan(chart.x + chart.width / 2);
  } else {
    expect(columns.split(" ")).toHaveLength(1);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the line uses most of the chart height", async ({ page }) => {
  await page.goto("/rank-chart");
  const svg = (await page.locator(".rank-chart-svg").boundingBox())!;
  const line = await page.locator(".rank-chart-line").evaluate((element) => {
    const { x, y, width, height } = (element as SVGGraphicsElement).getBBox();
    return { x, y, width, height };
  });
  // A fixed margin around the rank range left over a third of the box empty on
  // histories whose ranks barely move; the plot should stay mostly filled.
  expect(line.height).toBeGreaterThan(svg.height * 0.7);
  expect(line.y).toBeLessThan(svg.height * 0.15);
});
