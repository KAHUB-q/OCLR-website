"use client";

import { useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { PickemFixture, PickemNamedPage } from "@/lib/pickem-types";
import styles from "./pickem.module.css";

export function PickemNamedPredictions({
  slug,
  card,
}: {
  slug: string;
  card: PickemFixture;
}) {
  const tr = useAppTranslations();
  const [page, setPage] = useState<PickemNamedPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);

  async function load(cursor: number) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const query = new URLSearchParams({
        window: card.windowId,
        cursor: String(cursor),
      });
      const response = await fetch(
        `/api/tournaments/${slug}/pickem/fixtures/${card.fixtureId}/predictions?${query}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Predictions unavailable");
      const next: PickemNamedPage = await response.json();
      setPage((previous) => ({
        rows:
          cursor === 0 ? next.rows : [...(previous?.rows ?? []), ...next.rows],
        nextCursor: next.nextCursor,
      }));
    } catch {
      setFailed(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open && !page && !failed) void load(0);
      }}
    >
      <summary>{tr("View named predictions")}</summary>
      {page?.rows.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{tr("osu! name")}</th>
                <th scope="col">{tr("Prediction")}</th>
                <th scope="col">{tr("Score")}</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map(({ username, outcomeKey, score }, index) => (
                <tr key={index}>
                  <th scope="row">{username}</th>
                  <td>
                    {outcomeKey === "draw" ? tr("Draw") : card[outcomeKey].name}
                  </td>
                  <td>
                    {score ? `${score.homeWins} : ${score.awayWins}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        page && <p>{tr("No named predictions yet.")}</p>
      )}
      {busy && <p role="status">{tr("Loading…")}</p>}
      {failed && <p role="alert">{tr("Could not load named predictions.")}</p>}
      {(failed || page?.nextCursor != null) && (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void load(page?.nextCursor ?? 0)}
        >
          {failed ? tr("Try again") : tr("Load more")}
        </button>
      )}
    </details>
  );
}
