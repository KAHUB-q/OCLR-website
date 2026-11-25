import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import hans from "../../messages/zh-Hans.json";
import { ZonedDateInput } from "../../src/components/zoned-date-input";

afterEach(() => vi.unstubAllGlobals());

it("formats both repeated-hour choices in the interface language", () => {
  vi.stubGlobal("React", React);
  const instants = ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"];
  const zone = "America/New_York";
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="zh-Hans" messages={hans} timeZone={zone}>
      <ZonedDateInput
        label="开赛时间"
        value={instants[0]}
        timeZone={zone}
        onChange={vi.fn()}
        onValidityChange={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
  for (const instant of instants) {
    const label = new Date(instant).toLocaleTimeString("zh-Hans", {
      timeZone: zone,
      timeZoneName: "longOffset",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    expect(html).toContain(`${label} · ${instant}</option>`);
  }
});
