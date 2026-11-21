"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import { formatDate } from "@/lib/editions";
import { pickemStatusText, pickemVoidText } from "@/lib/pickem-labels";
import type { pickemAdminRead } from "@/lib/pickem";
import { ZonedDateInput } from "./zoned-date-input";
import styles from "./pickem.module.css";

type AdminData = Awaited<ReturnType<typeof pickemAdminRead>>;
type AdminFixture = AdminData["rows"][number];
type Action = "open" | "tighten" | "close" | "void";

export function PickemAdmin({ slug, data }: { slug: string; data: AdminData }) {
  const tr = useAppTranslations();
  const router = useRouter();
  const [round, setRound] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const rounds = new Map(data.rows.map((row) => [row.roundId, row.round]));

  async function toggle() {
    if (
      pending ||
      !window.confirm(
        data.settings.enabled
          ? tr("Disable match predictions for this season?")
          : tr("Enable match predictions for this season?"),
      )
    )
      return;
    setPending(true);
    setError(false);
    try {
      const response = await fetch(
        `/api/admin/tournaments/${slug}/pickem/settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: !data.settings.enabled,
            expectedVersion: data.settings.version,
          }),
        },
      );
      if (!response.ok) throw new Error("settings");
    } catch {
      setError(true);
    } finally {
      router.refresh();
      setPending(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.aside}>
        <h2>{tr("Prediction settings")}</h2>
        <p>
          {data.settings.enabled
            ? tr("Match predictions enabled")
            : tr("Match predictions disabled")}
        </p>
        {!data.published && (
          <p>{tr("Publish the tournament before opening predictions.")}</p>
        )}
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={pending || (!data.published && !data.settings.enabled)}
        >
          {data.settings.enabled
            ? tr("Disable match predictions")
            : tr("Enable match predictions")}
        </button>
        {error && (
          <p role="alert">{tr("Could not save the setting. Try again.")}</p>
        )}
      </section>
      <label>
        {tr("Rounds")}{" "}
        <select
          value={round}
          onChange={(event) => setRound(event.target.value)}
        >
          <option value="">{tr("All")}</option>
          {[...rounds].map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {!data.rows.length && <p>{tr("No matches match these filters.")}</p>}
      <ul className={styles.adminRows}>
        {data.rows
          .filter((row) => !round || row.roundId === round)
          .map((row) => (
            <li key={row.id}>
              <AdminRow
                key={`${row.fixtureVersion}-${row.window?.id}-${row.window?.version}`}
                slug={slug}
                row={row}
              />
            </li>
          ))}
      </ul>
    </div>
  );
}

function AdminRow({ slug, row }: { slug: string; row: AdminFixture }) {
  const tr = useAppTranslations();
  const router = useRouter();
  const active = row.window;
  const [closesAt, setClosesAt] = useState(active?.closesAt ?? row.scheduledAt);
  const [valid, setValid] = useState(false);
  const [scoreEnabled, setScoreEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const disabledReason =
    row.reason === "unpublished"
      ? tr("Publish the teams and match first.")
      : row.reason === "exhibition"
        ? tr("Exhibition matches do not support predictions.")
        : row.reason === "schedule"
          ? tr("Confirm the match time first.")
          : row.reason === "started"
            ? tr("This match has already started.")
            : row.reason === "rules"
              ? tr("Configure the round scoring rules first.")
              : null;
  const series = row.rules?.series;

  async function save(action: Action) {
    if (pending) return;
    if (
      (action === "close" || action === "void") &&
      !window.confirm(
        action === "close"
          ? tr("Close predictions for this match now?")
          : tr("Void predictions for this match?"),
      )
    )
      return;
    setPending(true);
    setError("");
    const body =
      action === "open"
        ? { action, closesAt, scoreEnabled, fixtureVersion: row.fixtureVersion }
        : {
            action,
            ...(action === "tighten" ? { closesAt } : {}),
            windowId: active?.id,
            expectedVersion: active?.version,
          };
    try {
      const result = await fetch(
        `/api/admin/tournaments/${slug}/pickem/fixtures/${row.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!result.ok) {
        setError(
          result.status === 409
            ? tr("This match changed. Refresh and try again.")
            : tr("Could not save the setting. Check the deadline."),
        );
        return;
      }
      router.refresh();
    } catch {
      setError(tr("Could not save the setting. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <details className={styles.aside}>
      <summary>
        <strong>
          {row.round} · {row.label}
        </strong>
        {active?.status ? ` · ${pickemStatusText(tr, active.status)}` : ""}
      </summary>
      <p>
        {row.home && row.away
          ? `${row.home} vs ${row.away}`
          : tr("To be announced")}{" "}
        · {formatDate(row.scheduledAt, row.timeZone, tr.locale)}
      </p>
      {series && (
        <p>
          {series.type === "first_to"
            ? tr("First to {wins} map wins", { wins: series.wins })
            : tr("{count} fixed maps", { count: series.count })}
        </p>
      )}
      {active && (
        <p>
          {tr("Pick deadline")} ·{" "}
          {formatDate(active.closesAt, row.timeZone, tr.locale)} ·{" "}
          {active.scoreEnabled ? tr("Score picks enabled") : tr("Results only")}
        </p>
      )}
      {active?.count !== null && active?.count !== undefined && (
        <p>
          {tr("Total predictions")} · {active.count}
        </p>
      )}
      {active?.result && (
        <p>
          {tr("Official result")} ·{" "}
          {active.result.outcomeKey === "draw"
            ? tr("Draw")
            : active.result.outcomeKey === "home"
              ? row.home
              : row.away}
        </p>
      )}
      {!active && disabledReason && <p>{disabledReason}</p>}
      {row.lastVoid && !active && <p>{pickemVoidText(tr, row.lastVoid)}</p>}
      {((!active && !disabledReason) || active?.status === "open") && (
        <ZonedDateInput
          label={tr("Pick deadline")}
          value={closesAt}
          timeZone={row.timeZone}
          onChange={setClosesAt}
          onValidityChange={setValid}
        />
      )}
      {!active && !disabledReason && (
        <label>
          <input
            type="checkbox"
            checked={scoreEnabled}
            onChange={(event) => setScoreEnabled(event.target.checked)}
          />{" "}
          {tr("Allow score predictions")}
        </label>
      )}
      <div className={styles.adminActions}>
        {!active && !disabledReason && (
          <button
            type="button"
            disabled={pending || !valid}
            onClick={() => void save("open")}
          >
            {tr("Open predictions")}
          </button>
        )}
        {active?.status === "open" && (
          <>
            <button
              type="button"
              disabled={pending || !valid || closesAt === active.closesAt}
              onClick={() => void save("tighten")}
            >
              {tr("Set earlier deadline")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void save("close")}
            >
              {tr("Close now")}
            </button>
          </>
        )}
        {active && (
          <button
            type="button"
            disabled={pending}
            className="secondary"
            onClick={() => void save("void")}
          >
            {tr("Void predictions")}
          </button>
        )}
        <Link href={`/admin/tournaments/${slug}/matches/${row.id}`}>
          {tr("Fixtures & results")}
        </Link>
      </div>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
