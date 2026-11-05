"use client";
import { useAppTranslations } from "@/i18n/shared";
import type {
  DifficultyChoice,
  DifficultyDisplay,
} from "@/lib/difficulty-display";
import {
  formatBeatmapDuration,
  formatBeatmapNumber,
} from "@/lib/mappool-model";
import styles from "./difficulty-display.module.css";
import { PublicationSwitch } from "./publication-switch";

export function DifficultyControls({
  choice,
  onChange,
  hasFM,
}: {
  choice: DifficultyChoice;
  onChange: (choice: DifficultyChoice) => void;
  hasFM: boolean;
}) {
  const tr = useAppTranslations();
  return (
    <div className={styles.controls}>
      <PublicationSwitch
        label={tr("Enable modded difficulty")}
        checked={choice.adjusted}
        onChange={(adjusted) => onChange({ ...choice, adjusted })}
      />
      {hasFM && (
        <div className={styles.fm} role="group" aria-label={tr("FM preview")}>
          <span>{tr("FM preview")}</span>
          <div className={styles.fmOptions}>
            {(["HD", "HR", "EZ"] as const).map((mod) => (
              <button
                type="button"
                className="secondary"
                key={mod}
                aria-pressed={choice.fm === mod}
                onClick={() =>
                  onChange({ adjusted: true, fm: choice.fm === mod ? "" : mod })
                }
              >
                {mod}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
export function DifficultyStatus({
  display: d,
}: {
  display: DifficultyDisplay;
}) {
  const tr = useAppTranslations();
  return (
    <span className="map-difficulty-status muted small" role="status">
      {d.fallback
        ? `${d.fallback === "recorded" ? tr("Recorded historical values") : tr("Base values")} · `
        : ""}
      {d.status === "base"
        ? tr("Base values")
        : d.status === "recorded"
          ? tr("Recorded historical values")
          : d.status === "adjusted"
            ? tr("Official Mod SR")
            : d.status === "variable"
              ? tr("Variable")
              : `${tr("Official Mod SR")} · ${tr("Not calculated")}`}
      {d.configuration && d.status !== "base" && d.status !== "recorded"
        ? ` · ${d.configuration}${d.fallback ? "" : ` · ${d.rate}×`}`
        : ""}
    </span>
  );
}
export function DifficultyReadout({
  display: d,
}: {
  display: DifficultyDisplay;
}) {
  const tr = useAppTranslations();
  const v = d.values;
  return (
    <>
      <DifficultyStatus display={d} />
      <dl className="map-detail-grid">
        {[
          [tr("SR"), `${formatBeatmapNumber(v.stars, 2)} ★`],
          [tr("BPM"), formatBeatmapNumber(v.bpm)],
          [tr("Length"), formatBeatmapDuration(v.duration)],
          [
            tr("AR / OD / CS / HP"),
            [v.ar, v.od, v.cs, v.hp]
              .map((n) => formatBeatmapNumber(n))
              .join(" / "),
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {(d.status === "adjusted" || (d.status === "missing" && !d.fallback)) && (
        <p className="muted small">
          {tr(
            "AR and OD include clock-rate timing; CS and HP are difficulty settings.",
          )}
        </p>
      )}
      {d.attributes && (
        <dl className="map-detail-grid">
          <div>
            <dt>{tr("Max combo")}</dt>
            <dd>{formatBeatmapNumber(d.attributes.maxCombo)}</dd>
          </div>
        </dl>
      )}
      {d.attributes && Object.keys(d.attributes.values).length > 0 && (
        <details>
          <summary>{tr("Official osu! API")}</summary>
          <dl className="map-detail-grid">
            {Object.entries(d.attributes.values).map(([label, value]) => (
              <div key={label}>
                <dt>{label.replaceAll("_", " ")}</dt>
                <dd>{formatBeatmapNumber(value)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {d.fetchedAt && (
        <p className="muted small">
          {tr("Official osu! API")}
          {" · "}
          {d.ruleset}
          {" · "}
          <time dateTime={d.fetchedAt}>
            {new Date(d.fetchedAt).toISOString().replace("T", " ").slice(0, 19)}{" "}
            UTC
          </time>
          {" · "}
          {tr("Current calculation, not a historical difficulty snapshot.")}
        </p>
      )}
    </>
  );
}
