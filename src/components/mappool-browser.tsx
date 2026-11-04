"use client";

import { useAppTranslations } from "@/i18n/shared";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { publicMappools } from "@/lib/mappools";
import {
  categories,
  fmPolicyName,
  slotLabel,
  formatBeatmapNumber as number,
  formatBeatmapDuration as duration,
} from "@/lib/mappool-model";
import { BeatmapActions } from "./beatmap-actions";
import { BeatmapCover } from "./beatmap-cover";
import { MapCardBand } from "./map-card-band";
import { MappoolView } from "./mappool-view";
import { WorkspaceTabs } from "./workspace-tabs";
import styles from "./public-mappools.module.css";
type Pool = Awaited<ReturnType<typeof publicMappools>>[number];
type Entry = Pool["entries"][number];
function modRating(entry: Entry) {
  const m = entry.metadata;
  return m.attributes
    ? `${number(m.attributes.stars, 2)} ★ · ${m.attributes.configuration}`
    : entry.category === "NM"
      ? "No Mod uses base difficulty"
      : entry.category === "TB"
        ? "Variable mods"
        : "Not calculated";
}
function MapDetails({
  entry,
  pool,
  slug,
  previous,
  next,
  onMove,
  onClose,
}: {
  entry: Entry;
  pool: Pool;
  slug: string;
  previous?: Entry;
  next?: Entry;
  onMove: (id: string) => void;
  onClose: () => void;
}) {
  const tr = useAppTranslations();

  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    const node = dialog.current!;
    const trigger = document.activeElement;
    node.showModal();
    return () => {
      node.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  const m = entry.metadata;
  return (
    <dialog
      ref={dialog}
      className="map-dialog"
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <span className="eyebrow">
          {pool.name} / {slotLabel(entry.category, entry.position)}
        </span>
        <button
          className="secondary"
          type="button"
          onClick={onClose}
          aria-label={tr("Close map details")}
        >
          {tr("Close")}
        </button>
      </header>
      <div className="map-dialog-body">
        <div className="map-detail-identity">
          <BeatmapCover key={m.setId} setId={m.setId} />
          <div>
            <p className="eyebrow">{m.artist}</p>
            <h2 id={title}>{m.title}</h2>
            <p className="muted">
              [{m.difficulty}] · {m.mapper}
            </p>
          </div>
        </div>
        <dl className="map-detail-grid">
          {[
            ["Beatmap ID", entry.beatmapId],
            ["Beatmapset ID", m.setId],
            ["Base difficulty", `${number(m.stars, 2)} ★`],
            ["Official Mod SR", tr(modRating(entry))],
            ["Base BPM", number(m.bpm)],
            ["Base length", duration(m.duration)],
            [
              "AR / OD / CS / HP",
              [m.ar, m.od, m.cs, m.hp].map((v) => number(v)).join(" / "),
            ],
            ...(m.attributes
              ? [
                  ["Ruleset", m.attributes.ruleset],
                  ["Max combo", number(m.attributes.maxCombo)],
                  ...Object.entries(m.attributes.values).map(
                    ([label, value]) => [
                      label.replaceAll("_", " "),
                      number(value),
                    ],
                  ),
                ]
              : []),
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{tr(String(label))}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {entry.source && (
          <p className="muted small">
            {tr("Historical source")}: {entry.source.editionName} ·{" "}
            {entry.source.poolName} · {entry.source.slot}
          </p>
        )}
        {entry.category === "FM" && (
          <p className="notice">
            {fmPolicyName(pool.fmMode) ?? tr("FM policy not configured")}
            {pool.fmRestrictions
              ? `: ${pool.fmRestrictions}`
              : tr(": Detailed restrictions have not been published.")}
          </p>
        )}
        <div className="actions">
          <BeatmapActions beatmapId={entry.beatmapId} setId={m.setId} />
          <Link
            className="button secondary"
            href={`/tournaments/${slug}/mappools/${pool.id}#map-${entry.id}`}
            onClick={onClose}
          >
            {tr("Map permalink")}
          </Link>
        </div>
        <div className="map-dialog-navigation">
          <button
            className="secondary"
            type="button"
            disabled={!previous}
            onClick={() => previous && onMove(previous.id)}
          >
            {tr("Previous map")}
          </button>
          <button
            className="secondary"
            type="button"
            disabled={!next}
            onClick={() => next && onMove(next.id)}
          >
            {tr("Next map")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
export function MappoolBrowser({
  pool,
  slug,
  headingLevel = 2,
}: {
  pool: Pool;
  slug: string;
  headingLevel?: 2 | 4 | 5;
}) {
  const tr = useAppTranslations();
  const tabId = useId();
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("slot");
  const [view, setView] = useState("cards");
  const [selected, setSelected] = useState<string | null>(null);
  const ordered = categories.flatMap((c) =>
    pool.entries
      .filter((e) => e.category === c)
      .sort((a, b) => a.position - b.position),
  );
  const term = search.trim().toLocaleLowerCase();
  const entries = ordered.filter(
    (e) =>
      (!category || e.category === category) &&
      (!term ||
        [
          slotLabel(e.category, e.position),
          e.beatmapId,
          e.metadata.title,
          e.metadata.artist,
          e.metadata.mapper,
          e.metadata.difficulty,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(term)),
  );
  if (sort === "title")
    entries.sort((a, b) => a.metadata.title.localeCompare(b.metadata.title));
  if (sort === "stars")
    entries.sort((a, b) => b.metadata.stars - a.metadata.stars);
  const activeIndex = entries.findIndex((e) => e.id === selected);
  const active = entries[activeIndex];
  const mean =
    pool.entries.length &&
    pool.entries.every((e) => Number.isFinite(e.metadata.stars))
      ? pool.entries.reduce((sum, e) => sum + e.metadata.stars, 0) /
        pool.entries.length
      : null;
  return (
    <div className={`mappool-browse ${styles.browse}`}>
      <div className={`pool-summary ${styles.summary}`}>
        <span role="status">
          <strong>{entries.length}</strong> / {pool.entries.length}{" "}
          {tr(" released maps")}
        </span>
        {mean !== null && (
          <span>
            <strong>{number(mean, 2)} ★</strong> {tr(" average base SR")}
          </span>
        )}
      </div>
      <div className={`map-browse-toolbar ${styles.toolbar}`}>
        <label className={`field map-search ${styles.search}`}>
          <span className="sr-only">
            {tr("Search ")}
            {pool.name}
          </span>
          <input
            type="search"
            value={search}
            placeholder={tr("Title, artist, mapper or slot")}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelected(null);
            }}
          />
        </label>
        <label className="field map-sort">
          <span className="sr-only">
            {tr("Sort ")}
            {pool.name}
          </span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setSelected(null);
            }}
          >
            <option value="slot">{tr("Slot order")}</option>
            <option value="title">{tr("Song title")}</option>
            <option value="stars">{tr("Base difficulty")}</option>
          </select>
        </label>
        <div
          className={`event-pills map-view-control ${styles.viewControl}`}
          role="group"
          aria-label={tr("{value0}: map view", { value0: pool.name })}
        >
          {["cards", "compact"].map((value) => (
            <button
              className="secondary"
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => {
                setView(value);
                setSelected(null);
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
                focusable="false"
              >
                {value === "cards" ? (
                  <>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 12h18" />
                  </>
                ) : (
                  <>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M3 15h18M9 3v18" />
                  </>
                )}
              </svg>
              {value === "cards" ? tr("Map cards") : tr("Compact table")}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.modTabs}>
        <WorkspaceTabs
          id={tabId}
          label={tr("{value0}: mod filter", { value0: pool.name })}
          appearance="line"
          value={category}
          onChange={(value) => {
            setCategory(value);
            setSelected(null);
          }}
          items={[
            { value: "", label: tr("All mods") },
            ...categories
              .filter((c) => pool.entries.some((e) => e.category === c))
              .map((c) => ({ value: c, label: c, literal: true })),
          ]}
        />
      </div>
      <div
        id={`${tabId}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabId}-${category}`}
      >
        {view === "compact" ? (
          <MappoolView
            pool={{ ...pool, entries }}
            headingLevel={headingLevel}
            onSelect={setSelected}
            showCategoryLinks={false}
          />
        ) : (
          <>
            {pool.entries.some((e) => e.category === "FM") && (
              <p className="map-values-note muted small">
                {fmPolicyName(pool.fmMode) ?? tr("FM policy not configured")}
                {pool.fmRestrictions
                  ? `: ${pool.fmRestrictions}`
                  : tr(": Detailed restrictions have not been published.")}
              </p>
            )}
            <div className={`map-card-grid ${styles.cards}`}>
              {entries.map((e) => {
                const slot = slotLabel(e.category, e.position);
                return (
                  <MapCardBand
                    className={styles.card}
                    showMode={!!e.metadata.mode && e.metadata.mode !== "osu"}
                    key={e.id}
                    id={`map-${e.id}`}
                    dataCategory={e.category}
                    slot={slot}
                    title={e.metadata.title}
                    artist={e.metadata.artist}
                    difficulty={e.metadata.difficulty}
                    mapper={e.metadata.mapper}
                    beatmapId={e.beatmapId}
                    setId={e.metadata.setId}
                    stars={e.metadata.stars}
                    bpm={e.metadata.bpm}
                    durationSeconds={e.metadata.duration}
                    cs={e.metadata.cs}
                    ar={e.metadata.ar}
                    od={e.metadata.od}
                    mode={e.metadata.mode}
                    headingLevel={headingLevel}
                    openLabel={tr("View {value0}: {value1}", {
                      value0: slot,
                      value1: e.metadata.title,
                    })}
                    onOpen={() => setSelected(e.id)}
                    chips={
                      e.metadata.attributes ? (
                        <span className="map-mod-rating">
                          {tr(modRating(e))}
                        </span>
                      ) : undefined
                    }
                    note={
                      e.category === "FM" && (
                        <p className="map-fm-policy muted small">
                          {fmPolicyName(pool.fmMode) ??
                            tr("FM policy not configured")}
                        </p>
                      )
                    }
                  />
                );
              })}
            </div>
          </>
        )}
        {!entries.length && (
          <p className="notice">{tr("No beatmaps match these filters.")}</p>
        )}
      </div>
      {active && (
        <MapDetails
          entry={active}
          pool={pool}
          slug={slug}
          previous={entries[activeIndex - 1]}
          next={entries[activeIndex + 1]}
          onMove={setSelected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
