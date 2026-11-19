import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  CompactPlayerRatings,
  CoverPlayerRatings,
} from "../../src/components/player-profile-ratings";
import { PlayerRatingRadar } from "../../src/components/player-rating-radar";
import {
  profileRatingsSchema,
  profileSipTotal,
} from "../../src/lib/profile-ratings-model";
import { sipRating, sipResponse } from "../fixtures/sip-response";

vi.mock("../../src/i18n/shared", () => ({
  useAppTranslations: () =>
    Object.assign((text: string) => text, { locale: "en" }),
}));

it("labels SIP sources separately and shows profile ETX ratings to two decimal places", () => {
  const time = "2025-06-04T12:34:00Z";
  const { modifications, skillsets } = sipResponse(1, 0);
  const ratings = profileRatingsSchema.parse({
    otr: null,
    sip: {
      api: {
        value: null,
        fetchedAt: time,
        snapshot: { rating: null, modifications, skillsets },
      },
      csv: { value: -4, importedAt: null },
    },
    etx: {
      source: "api",
      value: 6.13512525816855,
      mods: { NM: 0, HD: 6.1 },
      provisional: true,
      outdated: true,
      importedAt: time,
    },
  });
  const html = renderToStaticMarkup(<CoverPlayerRatings ratings={ratings} />);
  for (const text of [
    "-4",
    "SkillIssue API · OCLR fetch time",
    "S11 CSV · OCLR import time",
    "Elitebotix API · OCLR fetch time",
    time,
    "Hard Rock: 0",
    "High AR: -12",
    "26%",
    "74%",
    "6.14 ★",
    "Provisional rating",
    "Outdated rating",
    "0.00 ★",
    "6.10 ★",
    "No rating data",
  ])
    expect(html).toContain(text);
  expect(
    renderToStaticMarkup(
      <CompactPlayerRatings ratings={ratings} etxFractionDigits={2} />,
    ),
  ).toContain("6.14 ★");
  expect(
    renderToStaticMarkup(<CompactPlayerRatings ratings={ratings} />),
  ).toContain("6.13512525816855 ★");
  expect(
    profileSipTotal({
      ...ratings,
      sip: {
        ...ratings.sip,
        api: { value: 0, snapshot: null, fetchedAt: time },
      },
    }),
  ).toBe(0);
});

it("compares saved mod stars on one scale while preserving zero and gaps", () => {
  const ratings = profileRatingsSchema.parse({
    otr: null,
    sip: {
      api: {
        value: null,
        fetchedAt: "2025-06-04T12:34:00Z",
        snapshot: {
          rating: null,
          modifications: {
            NoMod: sipRating("NoMod", 2450),
            "Hard Rock": { ...sipRating("Hard Rock", 500), sr: 0 },
            "Double Time": { ...sipRating("Double Time", -12), sr: 12.25 },
          },
          skillsets: { "High AR": { ...sipRating("High AR", 0), sr: 8.75 } },
        },
      },
      csv: null,
    },
    etx: {
      source: "csv",
      value: 6.14,
      mods: { NM: 0, HR: 6.15, FM: 5 },
      provisional: false,
      outdated: false,
      importedAt: null,
    },
  });
  const html = renderToStaticMarkup(<PlayerRatingRadar ratings={ratings} />);
  expect(html).toContain(">15</text>");
  expect(html).toMatch(/scope="row">NM<\/th><td>0\.00 ★<\/td><td>5\.42 ★/);
  expect(html).toMatch(/scope="row">HR<\/th><td>6\.15 ★<\/td><td>0\.00 ★/);
  expect(html).toMatch(
    /scope="row">DT<\/th><td>.*?No rating data.*?<td>12\.25 ★/,
  );
  expect(html).toMatch(
    /scope="row">FM<\/th><td>5\.00 ★<\/td><td>.*?No rating data/,
  );
  expect(html).not.toMatch(/2450|8\.75/);
  const series = html.match(/<g data-provider="etx">(.*?)<\/g>/)?.[1];
  expect(series).toContain('cx="140" cy="126"');
  expect(series?.match(/ L /g)).toHaveLength(1);
});

it("omits the radar for saved overall ratings without mod values", () => {
  const ratings = profileRatingsSchema.parse({
    otr: null,
    sip: { api: null, csv: { value: 2000, importedAt: null } },
    etx: {
      value: 5,
      mods: null,
      provisional: false,
      outdated: false,
      importedAt: null,
    },
  });
  expect(renderToStaticMarkup(<PlayerRatingRadar ratings={ratings} />)).toBe(
    "",
  );
});
