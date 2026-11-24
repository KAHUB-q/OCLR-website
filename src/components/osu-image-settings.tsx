"use client";

import { useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type {
  OsuImageCommand,
  OsuImagePolicy,
} from "@/lib/admin-operations-write-contracts";

export function OsuImageSettings({ initial }: { initial: OsuImagePolicy }) {
  const tr = useAppTranslations();
  const [policy, setPolicy] = useState(initial);
  const [hours, setHours] = useState(String(initial.ttlHours));
  const [capacity, setCapacity] = useState(String(initial.capacityMiB));
  const [pending, setPending] = useState<OsuImageCommand["action"] | null>(
    null,
  );
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const avatar = initial.kind === "avatar";
  const dirty =
    Number(hours) !== policy.ttlHours ||
    Number(capacity) !== policy.capacityMiB;
  async function submit(command: OsuImageCommand) {
    if (pending) return;
    setPending(command.action);
    setError("");
    setFeedback("");
    try {
      const response = await fetch("/api/admin/settings/osu-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(tr(body.error));
        return;
      }
      // A refresh must not silently rebase another admin's pending policy edit.
      if (command.action === "save") setPolicy(body);
      setFeedback(
        command.action === "save"
          ? tr("Cache settings saved.")
          : avatar
            ? tr("All avatars will refresh on their next view.")
            : tr("All backgrounds will refresh on their next view."),
      );
    } catch {
      setError(tr("This request could not be completed. Please try again."));
    } finally {
      setPending(null);
    }
  }
  return (
    <section
      className="image-cache-row"
      aria-labelledby={`cache-${initial.kind}`}
      aria-busy={pending !== null}
    >
      <div className="image-cache-row-heading">
        <h3 id={`cache-${initial.kind}`}>
          {avatar ? tr("osu! avatars") : tr("Beatmap backgrounds")}
        </h3>
        <button
          className="secondary"
          type="button"
          disabled={pending !== null}
          onClick={() =>
            void submit({ action: "refreshAll", kind: initial.kind })
          }
        >
          {pending === "refreshAll"
            ? tr("Refreshing…")
            : avatar
              ? tr("Refresh all avatars")
              : tr("Refresh all backgrounds")}
        </button>
      </div>
      <form
        className="image-cache-policy"
        onSubmit={(event) => {
          event.preventDefault();
          void submit({
            action: "save",
            kind: initial.kind,
            ttlHours: Number(hours),
            capacityMiB: Number(capacity),
            expectedRevision: policy.revision,
          });
        }}
      >
        <label className="field">
          {tr("Cache lifetime (hours)")}
          <input
            disabled={pending !== null}
            required
            type="number"
            min={1}
            max={8760}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </label>
        <label className="field">
          {tr("Capacity limit (MiB)")}
          <input
            disabled={pending !== null}
            required
            type="number"
            min={8}
            max={2048}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </label>
        <button type="submit" disabled={!dirty || pending !== null}>
          {pending === "save" ? tr("Saving…") : tr("Save settings")}
        </button>
      </form>
      {feedback && (
        <p className="small" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <p className="notice error-text" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
