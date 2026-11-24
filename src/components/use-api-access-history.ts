import { useCallback, useEffect, useRef, useState } from "react";

type Entry = { id: string; revokedAt: string | null; expiresAt: string };
export type AccessState = "ready" | "stale" | "signed-out" | "forbidden";

export function useApiAccessHistory<T extends Entry>(
  initialTokens: T[],
  endpoint: string,
  interval: number,
  schema: { parse: (value: unknown) => T[] },
) {
  const [tokens, setTokens] = useState(initialTokens);
  const [issued, setIssued] = useState<{ id: string; token: string } | null>(
    null,
  );
  const [state, setState] = useState<AccessState>("ready");
  const [now, setNow] = useState(Date.now);
  const [confirmedAt, setConfirmedAt] = useState(0);
  const [pending, setPending] = useState(false);
  const mutating = useRef(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const blocked = state === "signed-out" || state === "forbidden";

  const refresh = useCallback(
    async (replace = false) => {
      if (!mounted.current || document.hidden || mutating.current) return;
      const started = Date.now();
      setNow(started);
      if (request.current && !replace) return;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          setState(response.status === 401 ? "signed-out" : "forbidden");
          setIssued(null);
          return;
        }
        if (!response.ok) throw new Error("Metadata unavailable");
        const body = await response.json();
        if (controller.signal.aborted) return;
        const entries = schema.parse(body.tokens);
        setTokens(entries);
        setConfirmedAt(started);
        setState("ready");
        setIssued((previous) =>
          previous &&
          entries.some(
            (entry) =>
              entry.id === previous.id &&
              !entry.revokedAt &&
              Date.parse(entry.expiresAt) > started,
          )
            ? previous
            : null,
        );
      } catch {
        if (!controller.signal.aborted) {
          setState((previous) => (previous === "ready" ? "stale" : previous));
        }
      } finally {
        if (request.current === controller) request.current = null;
      }
    },
    [endpoint, schema],
  );

  useEffect(() => {
    mounted.current = true;
    const foreground = () => {
      void refresh(true);
    };
    foreground();
    const timer = window.setInterval(() => {
      void refresh();
    }, interval);
    window.addEventListener("focus", foreground);
    document.addEventListener("visibilitychange", foreground);
    return () => {
      mounted.current = false;
      request.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", foreground);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [interval, refresh]);

  // A sliding lease is only known to have ended after a read started at or
  // beyond its last reported deadline. An earlier in-flight read may miss a renewal.
  useEffect(() => {
    const next = Math.min(
      ...tokens
        .filter((t) => !t.revokedAt)
        .map((t) => Date.parse(t.expiresAt))
        .filter((expiry) => expiry > now),
    );
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(
      () => {
        setNow(Date.now());
        void refresh(true);
      },
      Math.max(0, next - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [tokens, now, refresh]);

  function beginMutation() {
    if (blocked || mutating.current) return false;
    mutating.current = true;
    request.current?.abort();
    setPending(true);
    return true;
  }
  function handleMutationDenial(status: number, message: string) {
    // A 403 for an origin rejected by the server is a form error. The user
    // can still correct the origin or manage other credentials.
    if (
      status !== 401 &&
      !(
        status === 403 &&
        (message === "Developer access is required." ||
          message === "Streamer access is required for this edition.")
      )
    )
      return false;
    setState(status === 401 ? "signed-out" : "forbidden");
    setIssued(null);
    return true;
  }
  function finishMutation() {
    mutating.current = false;
    setPending(false);
    void refresh(true);
  }
  return {
    tokens,
    setTokens,
    issued,
    setIssued,
    now,
    confirmedAt,
    state,
    blocked,
    pending,
    beginMutation,
    handleMutationDenial,
    finishMutation,
  };
}
