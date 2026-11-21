"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import { formatDate } from "@/lib/editions";
import {
  legalPickemScore,
  type PickemOutcome,
  type PickemScore,
} from "@/lib/pickem-model";
import { pickemStatusText, pickemVoidText } from "@/lib/pickem-labels";
import type { PickemFixture, PickemSaved } from "@/lib/pickem-types";
import { TeamAvatar } from "./team-avatar";
import styles from "./pickem.module.css";

function ScoreFields({
  card,
  outcome,
  score,
  disabled,
  onChange,
}: {
  card: PickemFixture;
  outcome: PickemOutcome;
  score: PickemScore | null;
  disabled: boolean;
  onChange: (score: PickemScore | null) => void;
}) {
  const tr = useAppTranslations();
  const [home, setHome] = useState<number | null>(score?.homeWins ?? null);
  const rules = card.scoreRules!;
  const max =
    rules.series.type === "first_to" ? rules.series.wins : rules.series.count;
  const range = Array.from({ length: max + 1 }, (_, n) => n);
  const awayFor = (homeWins: number) =>
    range.filter((awayWins) =>
      legalPickemScore(rules, outcome, { homeWins, awayWins }),
    );
  const available = range.filter((homeWins) => awayFor(homeWins).length > 0);

  return (
    <fieldset className={styles.scoreFields} disabled={disabled}>
      <legend>{tr("Predict the score (optional)")}</legend>
      <label>
        {card.home.name}
        <select
          value={home ?? ""}
          onChange={(event) => {
            const chosen =
              event.target.value === "" ? null : Number(event.target.value);
            setHome(chosen);
            onChange(null);
          }}
        >
          <option value="">{tr("Map wins")}</option>
          {available.map((wins) => (
            <option key={wins} value={wins}>
              {wins}
            </option>
          ))}
        </select>
      </label>
      <label>
        {card.away.name}
        <select
          value={score?.awayWins ?? ""}
          disabled={home === null}
          onChange={(event) => {
            onChange(
              home === null || event.target.value === ""
                ? null
                : { homeWins: home, awayWins: Number(event.target.value) },
            );
          }}
        >
          <option value="">{tr("Map wins")}</option>
          {(home === null ? [] : awayFor(home)).map((wins) => (
            <option key={wins} value={wins}>
              {wins}
            </option>
          ))}
        </select>
      </label>
      <small>{tr("An exact score earns 1 extra point.")}</small>
    </fieldset>
  );
}

function distributionPercent(counts: number[]) {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (!total) return counts;
  const exact = counts.map((count) => (100 * count) / total);
  const percentages = exact.map(Math.floor);
  const remainder = 100 - percentages.reduce((sum, n) => sum + n, 0);
  exact
    .map((n, i) => ({ i, fraction: n - percentages[i] }))
    .sort((a, b) => b.fraction - a.fraction)
    .slice(0, remainder)
    .forEach(({ i }) => {
      percentages[i]++;
    });
  return percentages;
}

export function PickemMatchCard({
  card,
  slug,
  userId,
  signedIn,
  serverNow,
}: {
  card: PickemFixture;
  slug: string;
  userId: number | null;
  signedIn: boolean;
  serverNow: string;
}) {
  const tr = useAppTranslations();
  const router = useRouter();
  const [saved, setSaved] = useState(card.mine);
  const [outcome, setOutcome] = useState<PickemOutcome | null>(
    card.mine?.outcomeKey ?? null,
  );
  const [score, setScore] = useState<PickemScore | null>(
    card.mine?.score ?? null,
  );
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [checking, setChecking] = useState(false);
  const requestKey = useRef<{ body: string; value: string } | null>(null);
  const deadline = Date.parse(card.closesAt);
  const name = (key: PickemOutcome) =>
    key === "draw" ? tr("Draw") : card[key].name || tr("To be announced");
  const editable = card.status === "open" && signedIn && !checking;
  const stored =
    card.mine && (!saved || card.mine.version > saved.version)
      ? card.mine
      : saved;
  const changed =
    outcome !== (stored?.outcomeKey ?? null) ||
    JSON.stringify(score) !== JSON.stringify(stored?.score ?? null);
  const savedMessage =
    stored &&
    `${name(stored.outcomeKey)}${stored.score ? ` · ${stored.score.homeWins} : ${stored.score.awayWins}` : ""}`;
  const percentages = distributionPercent(
    card.distribution?.map(({ count }) => count) ?? [],
  );
  const draftKey =
    userId === null ? null : `pickem:${userId}:${slug}:${card.windowId}`;

  useEffect(() => {
    if (card.status !== "open") return;
    const timeout = window.setTimeout(
      () => {
        setChecking(true);
        router.refresh();
      },
      Math.min(Math.max(deadline - Date.parse(serverNow), 0) + 100, 2147483647),
    );
    return () => window.clearTimeout(timeout);
  }, [card.status, deadline, router, serverNow]);

  useEffect(() => {
    if (!draftKey || card.status !== "open") return;
    try {
      const raw = window.sessionStorage.getItem(draftKey);
      if (!raw) return;
      window.sessionStorage.removeItem(draftKey);
      const draft = JSON.parse(raw) as {
        outcome: PickemOutcome;
        score: PickemScore | null;
      };
      const handle = window.setTimeout(() => {
        if (card.outcomes.includes(draft.outcome)) {
          setOutcome(draft.outcome);
          setScore(draft.score);
        }
      }, 0);
      return () => window.clearTimeout(handle);
    } catch {
      // An unavailable storage device does not prevent normal picking.
    }
  }, [card.outcomes, card.status, draftKey]);

  async function submit() {
    if (!editable || !outcome || !changed || sending) return;
    setSending(true);
    setProblem("");
    setNotice("");
    const body = JSON.stringify({
      windowId: card.windowId,
      outcomeKey: outcome,
      score: score && { homeWins: score.homeWins, awayWins: score.awayWins },
      expectedVersion: stored?.version ?? null,
    });
    if (requestKey.current?.body !== body)
      requestKey.current = { body, value: crypto.randomUUID() };
    try {
      const response = await fetch(
        `/api/tournaments/${slug}/pickem/fixtures/${card.fixtureId}/pick`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": requestKey.current.value,
          },
          body,
        },
      );
      const data = (await response.json()) as {
        saved?: PickemSaved;
        current?: PickemSaved | null;
        code?: string;
      };
      if (response.ok && data.saved) {
        setSaved(data.saved);
        setNotice(tr("Prediction saved."));
        requestKey.current = null;
        router.refresh();
      } else if (response.status === 401) {
        if (draftKey) {
          try {
            window.sessionStorage.setItem(
              draftKey,
              JSON.stringify({ outcome, score }),
            );
          } catch {}
        }
        setProblem(tr("Your sign-in has expired."));
      } else if (response.status === 409 && data.code === "version_conflict") {
        if (data.current !== undefined) setSaved(data.current);
        requestKey.current = null;
        setProblem(tr("Your saved prediction changed. Review and save again."));
        router.refresh();
      } else if (response.status === 409 || response.status === 404) {
        setChecking(true);
        setProblem(
          tr("This prediction could not be saved. The match has changed."),
        );
        router.refresh();
      } else {
        setProblem(tr("Could not save the prediction. Try again."));
      }
    } catch {
      setProblem(tr("Could not save the prediction. Try again."));
    } finally {
      setSending(false);
    }
  }

  return (
    <article
      className={styles.card}
      aria-label={`${card.roundName} · ${card.label}`}
    >
      <header className={styles.cardHeader}>
        <Link href={`/tournaments/${slug}/matches/${card.fixtureId}`}>
          {card.roundName} · {card.label}
        </Link>
        <span className={styles.status} data-status={card.status}>
          {pickemStatusText(tr, card.status)}
        </span>
      </header>
      <div className={styles.times}>
        {card.scheduledAt && (
          <span>
            {tr("Starts")}{" "}
            <time dateTime={card.scheduledAt}>
              {formatDate(card.scheduledAt, card.timeZone, tr.locale)}
            </time>
          </span>
        )}
        <strong>
          {tr("Pick deadline")}{" "}
          <time dateTime={card.closesAt}>
            {formatDate(card.closesAt, card.timeZone, tr.locale)}
          </time>
        </strong>
      </div>
      {card.status === "open" && signedIn ? (
        <>
          <fieldset className={styles.choices} disabled={!editable || sending}>
            <legend className={styles.sr}>{tr("Choose a match result")}</legend>
            {card.outcomes.map((key) => (
              <label
                key={key}
                className={styles.choice}
                data-selected={key === outcome}
              >
                <input
                  type="radio"
                  name={card.windowId}
                  checked={key === outcome}
                  onChange={() => {
                    setOutcome(key);
                    setScore(null);
                    setNotice("");
                  }}
                />
                {key !== "draw" && <TeamAvatar team={card[key]} />}
                {name(key)}
              </label>
            ))}
          </fieldset>
          {outcome && card.scoreRules && (
            <ScoreFields
              key={outcome}
              card={card}
              score={score}
              outcome={outcome}
              disabled={!editable || sending}
              onChange={setScore}
            />
          )}
          <footer className={styles.cardFooter}>
            <div role="status" aria-live="polite">
              {stored && (
                <span>
                  {tr("Your prediction")} · {savedMessage}
                </span>
              )}
              {checking && (
                <span>{tr("Checking the prediction deadline…")}</span>
              )}
              {notice && <span className={styles.sr}>{notice}</span>}
            </div>
            <button
              type="button"
              aria-busy={sending}
              aria-disabled={!outcome || !changed || sending || !editable}
              onClick={() => void submit()}
            >
              {sending
                ? tr("Saving…")
                : stored && !changed
                  ? tr("Saved")
                  : tr("Save prediction")}
            </button>
          </footer>
        </>
      ) : card.distribution?.some((entry) => entry.count) ? (
        <div className={styles.distribution}>
          {card.distribution.map(({ outcomeKey, count }, i) => (
            <div key={outcomeKey}>
              <strong>{name(outcomeKey)}</strong>
              <progress value={percentages[i]} max={100} aria-hidden="true" />
              <span>
                {percentages[i]}% · {count}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.choices}>
          {[card.home, card.away].map((team) => (
            <div className={styles.choice} key={team.id}>
              <TeamAvatar team={team} />
              {team.name || tr("To be announced")}
            </div>
          ))}
          {card.distribution && <span>{tr("No predictions yet")}</span>}
        </div>
      )}
      {problem && (
        <p role="alert" className={styles.problem}>
          {problem}{" "}
          {problem === tr("Your sign-in has expired.") && (
            <Link href={`/auth/osu?pickem_return=/tournaments/${slug}/pickem`}>
              {tr("Sign in with osu!")}
            </Link>
          )}
        </p>
      )}
      {card.status !== "open" && (
        <footer className={styles.cardFooter}>
          <div>
            {stored && (
              <div>
                {tr("Your prediction")} · {savedMessage}
              </div>
            )}
            {card.result && (
              <div>
                {tr("Official result")} · {name(card.result.outcomeKey)}
                {card.result.score &&
                  ` · ${card.result.score.homeWins} : ${card.result.score.awayWins}`}
              </div>
            )}
            {card.status === "void" && (
              <span>{pickemVoidText(tr, card.voidReason)}</span>
            )}
          </div>
          {card.points && (
            <strong
              title={tr(
                "Result points: {outcome}. Exact score bonus: {score}.",
                {
                  outcome: card.points.outcomePoints,
                  score: card.points.scorePoints,
                },
              )}
            >
              +{card.points.points} {tr("Points")}
            </strong>
          )}
        </footer>
      )}
    </article>
  );
}
