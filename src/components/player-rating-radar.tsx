import { useAppTranslations } from "@/i18n/shared";
import { etxMods, type EtxMod } from "@/lib/etx-rating-model";
import type { ProfileRatings } from "@/lib/profile-ratings-model";
import styles from "./player-rating-radar.module.css";

const sipModNames: Partial<Record<EtxMod, string>> = {
  NM: "NoMod",
  HD: "Hidden",
  HR: "Hard Rock",
  DT: "Double Time",
};

const center = { x: 140, y: 126 };
const radius = 88;
const rings = [0.2, 0.4, 0.6, 0.8, 1];
const axes = etxMods.map((mod, index) => {
  const angle = (index / etxMods.length) * 2 * Math.PI - Math.PI / 2;
  return { mod, x: Math.cos(angle), y: Math.sin(angle) };
});

type Provider = "etx" | "sip";
type Point = { x: number; y: number };

function pointOnAxis(axis: Point, distance: number): Point {
  return {
    x: center.x + axis.x * distance,
    y: center.y + axis.y * distance,
  };
}

function SeriesMarker({ provider, x, y }: Point & { provider: Provider }) {
  return provider === "etx" ? (
    <circle className={styles.marker} cx={x} cy={y} r="4.5" />
  ) : (
    <path className={styles.marker} d={`M ${x} ${y - 3} l 3 3 -3 3 -3 -3 Z`} />
  );
}

function RadarSeries({
  provider,
  values,
  maximum,
}: {
  provider: Provider;
  values: (number | null)[];
  maximum: number;
}) {
  const points = axes.map((axis, index) => {
    const value = values[index];
    return value === null
      ? null
      : pointOnAxis(axis, (value / maximum) * radius);
  });
  const segments = points
    .map((point, index) => {
      const next = points[(index + 1) % points.length];
      return point && next
        ? `M ${point.x} ${point.y} L ${next.x} ${next.y}`
        : "";
    })
    .filter(Boolean)
    .join(" ");

  return (
    <g data-provider={provider}>
      {segments && <path className={styles.seriesLine} d={segments} />}
      {points.map((point, index) =>
        point ? (
          <SeriesMarker key={axes[index].mod} provider={provider} {...point} />
        ) : null,
      )}
    </g>
  );
}

function SeriesKey({ provider }: { provider: Provider }) {
  return (
    <svg aria-hidden="true" data-provider={provider} width="24" height="12">
      <path className={styles.seriesLine} d="M 1 6 H 23" />
      <SeriesMarker provider={provider} x={12} y={6} />
    </svg>
  );
}

export function PlayerRatingRadar({ ratings }: { ratings?: ProfileRatings }) {
  const tr = useAppTranslations();
  const sipMods = ratings?.sip.api?.snapshot?.modifications;
  const rows = etxMods.map((mod) => {
    const sipName = sipModNames[mod];
    const sr = sipName ? sipMods?.[sipName]?.sr : undefined;
    return {
      mod,
      etx: ratings?.etx?.mods?.[mod] ?? null,
      sip: sr !== undefined && sr >= 0 ? sr : null,
    };
  });
  if (rows.every(({ etx, sip }) => etx === null && sip === null)) return null;

  const highest = Math.max(
    10,
    ...rows.flatMap(({ etx, sip }) => [etx ?? 0, sip ?? 0]),
  );
  const rounded = Math.ceil(highest / rings.length) * rings.length;
  const maximum = Number.isFinite(rounded) ? rounded : highest;
  const tickFormat = new Intl.NumberFormat(tr.locale, {
    notation: maximum >= 1e4 ? "scientific" : "standard",
    maximumFractionDigits: 1,
  });
  const starFormat = new Intl.NumberFormat(tr.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const starValue = (value: number | null) =>
    value === null ? (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{tr("No rating data")}</span>
      </>
    ) : (
      <>
        {value >= 1e6 ? tickFormat.format(value) : starFormat.format(value)} ★
      </>
    );

  return (
    <section className="spaced" aria-labelledby="player-rating-radar">
      <h2 id="player-rating-radar">{tr("Mod rating radar")}</h2>
      <div className={`panel ${styles.card}`}>
        <svg className={styles.radar} viewBox="0 0 280 234" aria-hidden="true">
          {rings.map((ring) => (
            <polygon
              className={styles.grid}
              key={ring}
              points={axes
                .map((axis) => {
                  const point = pointOnAxis(axis, radius * ring);
                  return `${point.x},${point.y}`;
                })
                .join(" ")}
            />
          ))}
          {axes.map((axis) => {
            const edge = pointOnAxis(axis, radius);
            const label = pointOnAxis(axis, radius + 24);
            return (
              <g key={axis.mod}>
                <line
                  className={styles.grid}
                  x1={center.x}
                  y1={center.y}
                  x2={edge.x}
                  y2={edge.y}
                />
                <text
                  className={styles.mod}
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {axis.mod}
                </text>
              </g>
            );
          })}
          {rings.map((ring) => (
            <text
              className={styles.tick}
              key={ring}
              x={center.x + 5}
              y={center.y - radius * ring - 3}
            >
              {tickFormat.format(maximum * ring)}
            </text>
          ))}
          <RadarSeries
            provider="etx"
            values={rows.map(({ etx }) => etx)}
            maximum={maximum}
          />
          <RadarSeries
            provider="sip"
            values={rows.map(({ sip }) => sip)}
            maximum={maximum}
          />
        </svg>
        <div className={styles.values}>
          <table className={styles.table} aria-labelledby="player-rating-radar">
            <thead>
              <tr>
                <th scope="col">{tr("Mods")}</th>
                <th scope="col">
                  <SeriesKey provider="etx" />
                  {tr("Elitebotix")}
                </th>
                <th scope="col">
                  <SeriesKey provider="sip" />
                  {tr("SkillIssue SR")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ mod, etx, sip }) => (
                <tr key={mod}>
                  <th scope="row">{mod}</th>
                  <td>{starValue(etx)}</td>
                  <td>{starValue(sip)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">
            {tr(
              "Each source uses its own star rating model. A dash indicates missing data.",
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
