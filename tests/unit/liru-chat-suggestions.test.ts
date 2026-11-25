import { createTranslator } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import { appTranslator } from "../../src/i18n/translate";
import { seasonCountIntent } from "../../src/lib/chat-season-counts";
import { pickLiruSuggestions } from "../../src/lib/liru-chat-suggestions";

afterEach(() => vi.restoreAllMocks());

it.each([
  ["en", en],
  ["zh-Hans", hans],
  ["zh-Hant", hant],
] as const)(
  "draws three distinct, supported local counts in %s",
  (locale, catalog) => {
    const native = createTranslator({ locale, messages: catalog.ui });
    const tr = appTranslator(
      (key, values) => native(key as keyof typeof catalog.ui, values),
      locale,
    );
    const expected = [
      "registration",
      "upcoming",
      { mod: "HD" },
      { mod: "NM" },
      { mod: "HR" },
      { mod: "DT" },
      { mod: "FM" },
      { mod: "TB" },
      { mod: "ACE" },
      "teams",
      "matches",
      "results",
      "pools",
      "slots",
      "uniqueMaps",
      "draftPicks",
    ];
    const random = vi.spyOn(Math, "random");
    // Exercise every possible first pick without depending on chance.
    for (const [index, intent] of expected.entries()) {
      random.mockReturnValue((index + 0.5) / expected.length);
      const questions = pickLiruSuggestions(tr);
      expect(questions).toHaveLength(3);
      expect(new Set(questions).size).toBe(3);
      expect(seasonCountIntent(questions[0])).toEqual(intent);
    }
  },
);
