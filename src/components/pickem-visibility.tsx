"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";

export function PickemVisibility({
  slug,
  initial,
}: {
  slug: string;
  initial: { listed: boolean; version: number };
}) {
  const tr = useAppTranslations();
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const value = initial.version > saved.version ? initial : saved;

  async function update(listed: boolean) {
    setError(false);
    setPending(true);
    try {
      const response = await fetch(
        `/api/tournaments/${slug}/pickem/me/leaderboard-visibility`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listed, expectedVersion: value.version }),
        },
      );
      if (!response.ok) throw new Error("save");
      setSaved(await response.json());
      router.refresh();
    } catch {
      setError(true);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <label>
        <input
          type="checkbox"
          role="switch"
          checked={value.listed}
          disabled={pending}
          onChange={(event) => void update(event.target.checked)}
        />{" "}
        {tr("Show my osu! name on the leaderboard")}
      </label>
      {error && (
        <p role="alert">{tr("Could not save the setting. Try again.")}</p>
      )}
    </div>
  );
}
