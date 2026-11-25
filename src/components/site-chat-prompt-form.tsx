"use client";

import { useState, type FormEvent } from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  chatPromptLimit,
  updateChatPromptWrite,
} from "@/lib/chat-prompt-contract";

type ChatPrompt = { prompt: string; revision: number };

export function SiteChatPromptForm({ initial }: { initial: ChatPrompt }) {
  const tr = useAppTranslations();
  const [saved, setSaved] = useState(initial);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || stale || prompt.trim() === saved.prompt) return;
    setBusy(true);
    setFeedback("");
    setError("");
    try {
      const response = await fetch(updateChatPromptWrite.path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, expectedRevision: saved.revision }),
      });
      const body = await response.json();
      if (!response.ok) {
        setStale(response.status === 409);
        setError(tr(body.error));
        return;
      }
      const next = updateChatPromptWrite.response.parse(body);
      setSaved(next);
      setPrompt(next.prompt);
      setFeedback(tr("Liru chat settings saved."));
    } catch {
      setError(tr("This request could not be completed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={save} aria-busy={busy}>
      <fieldset className="settings-card form-stack" disabled={busy}>
        <legend>{tr("Liru chat settings")}</legend>
        <label className="field">
          <span>{tr("Custom prompt")}</span>
          <textarea
            rows={6}
            maxLength={chatPromptLimit}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            aria-describedby="liru-prompt-help"
          />
        </label>
        <small id="liru-prompt-help">
          {tr(
            "Adjust the tone and format of Liru’s replies. Leave blank to use the built-in settings. Keep passwords, API keys and private information out of this field.",
          )}
        </small>
        <div className="actions">
          <button
            type="submit"
            disabled={stale || prompt.trim() === saved.prompt}
          >
            {busy ? tr("Saving…") : tr("Save")}
          </button>
        </div>
      </fieldset>
      {feedback && (
        <p role="status" className="notice">
          {feedback}
        </p>
      )}
      {error && (
        <div role="alert" className="notice error-text">
          <p>{error}</p>
          {stale && (
            <button
              className="secondary"
              type="button"
              onClick={() => window.location.reload()}
            >
              {tr("Refresh")}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
