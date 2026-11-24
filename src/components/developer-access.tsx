"use client";

import { ApiAccessForm } from "./api-access-form";
import styles from "./api-access-form.module.css";
import { ApiAccessHistory } from "./api-access-history";

import { LoadingRegion } from "./loading-region";

import { useState, type FormEvent } from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  developerApiScopes,
  isDeveloperPort,
  maxDeveloperPorts,
  type DeveloperApiScope,
  type DeveloperTokenMetadata,
} from "@/lib/developer-api-model";
import {
  revokeDeveloperTokenWrite,
  type CreateDeveloperTokenInput,
  type DeveloperTokenIssued,
} from "@/lib/developer-token-write-contract";

import { useApiAccessHistory } from "./use-api-access-history";

const tokenList = revokeDeveloperTokenWrite.response.array();

export function DeveloperAccess({
  backend,
  allowedPorts,
  initialTokens,
}: {
  backend: string;
  allowedPorts: number[] | null;
  initialTokens: DeveloperTokenMetadata[];
}) {
  const tr = useAppTranslations();
  const [ports, setPorts] = useState<number[]>(
    allowedPorts === null ? [3000] : allowedPorts.slice(0, 1),
  );
  const [portInput, setPortInput] = useState("");
  const [portError, setPortError] = useState("");
  const [scopes, setScopes] = useState<DeveloperApiScope[]>([
    ...developerApiScopes,
  ]);
  const {
    tokens,
    setTokens,
    issued,
    setIssued,
    pending,
    beginMutation,
    handleMutationDenial,
    finishMutation,
    now,
    state,
    blocked,
  } = useApiAccessHistory(
    initialTokens,
    "/api/developer/tokens",
    60000,
    tokenList,
  );
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const labels: Record<DeveloperApiScope, string> = {
    "identity:read": tr("Your API identity"),
    "tournaments:read": tr("Public tournament information"),
    "tournaments:private:read": tr("Private tournament information"),
    "profiles:read": tr("Saved osu! profiles"),
  };
  function addPort() {
    const value = portInput.trim();
    const port = Number(value);
    if (!/^[0-9]{1,5}$/.test(value) || !isDeveloperPort(port)) {
      setPortError(tr("Enter a port between 1 and 65535."));
      return;
    }
    if (ports.includes(port)) {
      setPortError(tr("This port is already in the list."));
      return;
    }
    if (allowedPorts !== null && !allowedPorts.includes(port)) {
      setPortError(tr("This port is not allowed by the server."));
      return;
    }
    if (ports.length >= maxDeveloperPorts) {
      setPortError(tr("You can add up to 20 local ports."));
      return;
    }
    setPorts((previous) => [...previous, port]);
    setPortInput("");
    setPortError("");
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ports.length) return;
    if (portInput.trim()) {
      setPortError(
        tr("Add the entered port to the list before creating a token."),
      );
      return;
    }
    if (!beginMutation()) return;
    setActiveAction("create");
    setError("");
    setIssued(null);
    try {
      const input = { ports, scopes } satisfies CreateDeveloperTokenInput;
      const response = await fetch("/api/developer/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        if (!handleMutationDenial(response.status, result.error))
          setError(result.error);
        return;
      }
      const { access, token } = result as DeveloperTokenIssued;
      setTokens((previous) => [access, ...previous]);
      setIssued({ id: access.id, token });
    } catch {
      setError(
        "Connection interrupted. Refresh to check the saved state before retrying.",
      );
    } finally {
      finishMutation();
    }
  }
  async function revoke(id: string) {
    if (!beginMutation()) return;
    setActiveAction(id);
    setError("");
    try {
      const response = await fetch(`/api/developer/tokens/${id}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        if (!handleMutationDenial(response.status, result.error))
          setError(result.error);
        return;
      }
      const revoked = result as DeveloperTokenMetadata;
      setTokens((previous) =>
        previous.map((entry) => (entry.id === id ? revoked : entry)),
      );
      if (issued?.id === id) setIssued(null);
    } catch {
      setError(
        "Connection interrupted. Refresh to check the saved state before retrying.",
      );
    } finally {
      finishMutation();
    }
  }
  return (
    <div className="stack developer-access">
      {pending && <LoadingRegion />}
      <ApiAccessForm
        backend={backend}
        onSubmit={create}
        description={
          <p>
            {tr(
              "Use this backend from your local frontend. Access ends within one hour or when this login session ends.",
            )}
          </p>
        }
      >
        <fieldset
          className={styles.group}
          disabled={blocked || pending || allowedPorts?.length === 0}
        >
          <legend>{tr("Allowed local ports")}</legend>
          <p id="developer-ports-help" className="muted small">
            {tr(
              "Add the ports used by your local frontends. One token can serve multiple development sessions.",
            )}
          </p>
          <p className="muted small">
            {tr(
              "localhost, 127.0.0.1 and [::1] share the same port list for HTTP and HTTPS.",
            )}
          </p>
          {allowedPorts !== null && (
            <p className="small">
              {allowedPorts.length
                ? tr("Server-allowed ports: {ports}", {
                    ports: allowedPorts.join(", "),
                  })
                : tr("The server has disabled local developer access.")}
            </p>
          )}
          <div className={styles.controls}>
            <label className="field" htmlFor="developer-port-input">
              {tr("Add local port")}
              <input
                id="developer-port-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="5173"
                value={portInput}
                aria-describedby={`developer-ports-help${portError ? " developer-port-error" : ""}`}
                aria-invalid={Boolean(portError)}
                onChange={(event) => {
                  setPortInput(event.target.value);
                  setPortError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addPort();
                  }
                }}
              />
            </label>
            <button type="button" className="secondary" onClick={addPort}>
              {tr("Add port")}
            </button>
          </div>
          {portError && (
            <p
              id="developer-port-error"
              className="error-text small"
              role="alert"
            >
              {portError}
            </p>
          )}
          {ports.length ? (
            <ul
              className="developer-port-list"
              aria-label={tr("Allowed local ports")}
            >
              {ports.map((port) => (
                <li key={port}>
                  <code>{port}</code>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={tr("Remove port {port}", { port })}
                    onClick={() => {
                      setPorts((previous) =>
                        previous.filter((value) => value !== port),
                      );
                      setPortError("");
                    }}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">{tr("Add at least one local port.")}</p>
          )}
          <p className="muted small">
            {tr("You can add up to 20 local ports.")}
          </p>
        </fieldset>
        <fieldset className={styles.group}>
          <legend>{tr("Read scopes")}</legend>
          <div className={styles.scopes}>
            {developerApiScopes.map((scope) => (
              <label key={scope} className="check-field">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  disabled={blocked || pending}
                  onChange={(event) =>
                    setScopes((previous) =>
                      event.target.checked
                        ? [...previous, scope]
                        : previous.filter((value) => value !== scope),
                    )
                  }
                />
                <span>
                  {labels[scope]}
                  <code>{scope}</code>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="muted small">
          {tr(
            "Private data requires an active Developer grant. Use the API specification to choose a resource and its read scope.",
          )}
        </p>
        <div className="actions">
          <button
            disabled={
              blocked ||
              pending ||
              !ports.length ||
              !scopes.length ||
              Boolean(portInput.trim())
            }
            aria-busy={pending && activeAction === "create"}
          >
            {tr("Create token")}
          </button>
        </div>
      </ApiAccessForm>
      {error && (
        <p className="notice error-text" role="alert">
          {tr(error)}
        </p>
      )}
      {issued && (
        <section
          className="notice"
          role="status"
          aria-labelledby="developer-issued"
        >
          <h2 id="developer-issued">{tr("Copy your token now")}</h2>
          <p>
            {tr(
              "It is shown only once. Keep it private and out of source code, URLs and screenshots.",
            )}
          </p>
          <label className="field">
            {tr("New API token")}
            <textarea
              readOnly
              value={issued.token}
              rows={3}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setIssued(null)}
            >
              {tr("Hide token")}
            </button>
          </div>
        </section>
      )}
      <ApiAccessHistory
        entries={tokens.map((entry) => ({
          id: entry.id,
          title: tr("Allowed local ports") + " " + entry.ports.join(" · "),
          scopeText: entry.scopes.map((scope) => labels[scope]).join(" · "),
          expiresAt: entry.expiresAt,
          revokedAt: entry.revokedAt,
        }))}
        emptyMessage={tr("No developer API access has been created.")}
        expiryText={(date) => tr("Expires {date}", { date })}
        now={now}
        confirmedAt={now}
        state={state}
        permissionNotice={tr("Developer access is required.")}
        pending={pending}
        activeAction={activeAction}
        onRevoke={revoke}
      />
    </div>
  );
}
