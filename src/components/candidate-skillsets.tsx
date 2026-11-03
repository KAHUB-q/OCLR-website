"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  canonicalSkillsets,
  skillsetGroups,
  skillsetLabels,
  type SkillsetTag,
} from "@/lib/mappool-skillsets";
import { Spinner } from "./spinner";
import { WorkbenchActionIcon } from "./workbench-action-icon";
import styles from "./mappool-workbench.module.css";

export function CandidateSkillsets({
  candidateId,
  title,
  tags,
  version,
  url,
  writable,
  onChange,
}: {
  candidateId: string;
  title: string;
  tags: SkillsetTag[];
  version: number;
  url: string;
  writable: boolean;
  onChange: () => Promise<void>;
}) {
  const tr = useAppTranslations();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SkillsetTag[]>([]);
  const [expectedVersion, setVersion] = useState(version);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const node = dialog.current!;
    const opener = trigger.current;
    node.showModal();
    return () => {
      node.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);
  function close() {
    if (!busy) setOpen(false);
  }
  async function save() {
    if (busy || !writable) return;
    setBusy(true);
    setError("");
    let saved = false;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "skillsets",
          candidateId,
          tags: canonicalSkillsets(draft),
          expectedVersion,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        if (response.status === 409) await onChange().catch(() => {});
        throw new Error(
          result?.error ??
            "This request could not be completed. Please try again.",
        );
      }
      // Close after a successful write; a subsequent list-refresh error must not
      // offer another save against the now-stale version.
      saved = true;
      setOpen(false);
      await onChange();
    } catch (e) {
      setError(
        saved
          ? tr("Tags saved, but the list could not refresh. Reload this page.")
          : e instanceof Error
            ? e.message
            : "This request could not be completed. Please try again.",
      );
    } finally {
      setBusy(false);
      if (saved) requestAnimationFrame(() => trigger.current?.focus());
    }
  }
  return (
    <section className={styles.skillsets} aria-labelledby={`${id}-summary`}>
      <div className={styles.discussionHeading}>
        <h3 id={`${id}-summary`}>{tr("Skillset Tags")}</h3>
        {writable && (
          <button
            type="button"
            className="secondary"
            ref={trigger}
            onClick={() => {
              setDraft([...tags]);
              setVersion(version);
              setError("");
              setOpen(true);
            }}
            disabled={busy}
          >
            {tr("Edit tags")}
          </button>
        )}
      </div>
      <div className={styles.skillsetSummary}>
        {tags.length ? (
          tags.map((tag) => <span key={tag}>{skillsetLabels[tag]}</span>)
        ) : (
          <p className="small muted">{tr("No skillset tags yet.")}</p>
        )}
      </div>
      {!open && error && (
        <p role="alert" className="notice error-text">
          {tr(error)}
        </p>
      )}
      {open && (
        <dialog
          ref={dialog}
          className={styles.skillsetDialog}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-description`}
          aria-busy={busy}
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
          onClick={(e) => {
            if (e.target !== dialog.current) return;
            const box = dialog.current.getBoundingClientRect();
            if (
              e.clientX < box.left ||
              e.clientX > box.right ||
              e.clientY < box.top ||
              e.clientY > box.bottom
            )
              close();
          }}
        >
          <header className={styles.skillsetHeading}>
            <div>
              <h2 id={`${id}-title`}>{tr("Edit skillset tags")}</h2>
              <p id={`${id}-description`} className="small muted">
                {title} · {tr("Select multiple tags.")}
              </p>
            </div>
            <button
              type="button"
              className="secondary"
              aria-label={tr("Close")}
              onClick={close}
              disabled={busy}
            >
              ×
            </button>
          </header>
          <div className={styles.skillsetBody}>
            <fieldset disabled={busy} className={styles.skillsetFields}>
              <legend className="sr-only">{tr("Skillset Tags")}</legend>
              {skillsetGroups.map((group) => (
                <fieldset key={group.name} className={styles.skillsetGroup}>
                  <legend>{group.name}</legend>
                  <div className={styles.skillsetChoices}>
                    {group.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={`secondary ${styles.skillsetChoice}`}
                        aria-pressed={draft.includes(tag)}
                        onClick={() =>
                          setDraft((values) =>
                            values.includes(tag)
                              ? values.filter((value) => value !== tag)
                              : canonicalSkillsets([...values, tag]),
                          )
                        }
                      >
                        <span aria-hidden="true">
                          {draft.includes(tag) ? "✓ " : ""}
                        </span>
                        {skillsetLabels[tag]}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
            </fieldset>
            {error && (
              <p role="alert" className="notice error-text">
                {tr(error)}
              </p>
            )}
          </div>
          <footer className={styles.skillsetFooter}>
            <span className="small muted" role="status">
              {tr("{count} tags selected", { count: draft.length })}
            </span>
            <div className={styles.skillsetActions}>
              <button
                type="button"
                className="secondary mappool-icon-action"
                aria-label={tr("Clear selection")}
                title={tr("Clear selection")}
                disabled={busy || !draft.length}
                onClick={() => setDraft([])}
              >
                <WorkbenchActionIcon kind="clear" />
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={close}
              >
                {tr("Cancel")}
              </button>
              <button
                type="button"
                disabled={busy || !writable}
                aria-busy={busy}
                onClick={() => void save()}
              >
                {busy ? <Spinner compact /> : tr("Apply tags")}
              </button>
            </div>
          </footer>
        </dialog>
      )}
    </section>
  );
}
