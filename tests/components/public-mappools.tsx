import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { PublicMappools } from "../../src/components/public-mappools";
import { MappoolBrowser } from "../../src/components/mappool-browser";
import { ArchiveMappools } from "../../src/components/archive-mappools";
import { PageHeading } from "../../src/components/ui";
import { syntheticPublicPools } from "../fixtures/public-mappools";
import { legacyS5Mappool } from "../fixtures/legacy-s5-mappool";
import { archivePoolMetadata } from "../../src/lib/archive-map-metadata";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/skyline-theme.css";
import "../../src/app/glacier-theme.css";
import "../../src/app/sakura-theme.css";

const params = new URLSearchParams(location.search);
const locale = params.get("locale") ?? "en";
document.documentElement.lang = locale;
document.documentElement.dataset.theme = params.get("theme") ?? "light";
document.documentElement.dataset.appearance =
  params.get("appearance") ?? "default";
const messages = locale === "en" ? en : locale === "zh-Hans" ? hans : hant;
const legacy = params.has("legacy-s5")
  ? archivePoolMetadata(legacyS5Mappool, "s5")
  : null;
const pools = params.has("single")
  ? syntheticPublicPools
      .slice(0, 1)
      .map((pool) => ({ ...pool, roundName: pool.name }))
  : params.has("duplicates")
    ? syntheticPublicPools.map((pool, index) => ({
        ...pool,
        name: "Shared authored name",
        roundName: index ? "Final round" : "Group round",
        stage: index ? ("knockout" as const) : ("group" as const),
      }))
    : syntheticPublicPools;
const translated = (english: string) =>
  english === "Mappools" ? (locale === "en" ? "Mappools" : "圖池") : english;

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
    <main
      className="themed-site public-tournament"
      style={{ padding: "24px 16px", maxWidth: 1280, margin: "0 auto" }}
    >
      <PageHeading title={translated("Mappools")} />
      {params.has("archive") ? (
        <div className="historical-archive">
          <ArchiveMappools
            pool={
              legacy?.pool ?? {
                id: "archive",
                name: "Synthetic archive",
                source: "Synthetic browser fixture",
                maps: [
                  {
                    slot: "NM1",
                    beatmapId: 880000,
                    title:
                      "Synthetic artist - Synthetic archive song [Expert] (Synthetic mapper)",
                    mapper: "Synthetic mapper",
                    stars: 6.5,
                    bpm: 180,
                    drainSeconds: 194,
                    cs: 4,
                    ar: 9.5,
                    od: 8.5,
                    source: "Synthetic browser fixture",
                  },
                ],
              }
            }
            artworkSetIds={legacy?.setIds ?? {}}
            missingBeatmapIds={legacy?.missingBeatmapIds}
            stages={[
              {
                id: "archive",
                name: "Synthetic archive",
                count: 1,
                href: "#archive",
              },
            ]}
          />
        </div>
      ) : params.has("detail") ? (
        <MappoolBrowser slug="synthetic" pool={pools[0]} />
      ) : (
        <PublicMappools slug="synthetic" pools={pools} />
      )}
    </main>
  </NextIntlClientProvider>,
);
