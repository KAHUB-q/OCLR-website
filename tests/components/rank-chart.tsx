import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { PlayerProfile } from "../../src/components/player-profile";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { profileResponse } from "../fixtures/osu-profile";
import en from "../../messages/en.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";

// Synthetic rank history: a slow climb with noise, newest sample last.
let rank = 16200;
const history = Array.from({ length: 120 }, (_, index) => {
  rank -= 24;
  rank += index % 7 === 0 ? 180 : -Math.round(index % 5) * 12;
  return Math.max(1, rank);
});
const params = new URLSearchParams(location.search);
const gaps = params.get("gaps");
const samples: Record<string, (number | null)[]> = {
  none: [16200, 15900, 15500, 15000],
  one: [16200, null, 15500, 15000],
  two: [16200, null, null, 15000],
  trailing: [16200, null, null, null],
  ended: [16200, 15000, null, null],
  flat: [15000, null, null, null],
  today: [null, null, null, 16200],
  empty: [],
};
const profile = normalizeOsuProfile(
  {
    ...profileResponse,
    cover: null,
    rank_history: { mode: "osu", data: samples[gaps ?? ""] ?? history },
    statistics: {
      ...profileResponse.statistics,
      global_rank: params.has("unranked") ? null : gaps ? 15000 : 12345,
    },
  },
  profileResponse.id,
  "osu",
  params.has("undated")
    ? ""
    : gaps
      ? "2026-11-04T09:00:00Z"
      : "2026-11-01T23:30:00Z",
);
if (params.has("legacy") && profile.rankHistory)
  delete profile.rankHistory.dayOffsets;

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <main style={{ padding: 24 }}>
      {/* The real layout wraps every page in .themed-site; tokens live there. */}
      <div className="themed-site">
        <PlayerProfile snapshot={{ profile, stale: false, notice: null }} />
      </div>
    </main>
  </NextIntlClientProvider>,
);
