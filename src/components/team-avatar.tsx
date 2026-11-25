"use client";
import { cachedImageUrl } from "@/lib/osu-image-urls";
import Image from "next/image";
import { useState } from "react";
import { splitGraphemes } from "unicode-segmenter/grapheme";

function teamInitials(name: string) {
  const [first = "", second = ""] = splitGraphemes(name.trim());
  return (first + second).toLocaleUpperCase();
}

export function TeamAvatar({
  team,
}: {
  team: {
    id: string;
    name: string;
    avatarKey?: string | null;
    captainId?: number | null;
  };
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const custom = team.avatarKey
    ? `/api/teams/${team.id}/avatar?v=${team.avatarKey}`
    : null;
  const captain = team.captainId
    ? cachedImageUrl(`https://a.ppy.sh/${team.captainId}`)
    : null;
  const src = [custom, captain].find((url) => url && !failed.includes(url));
  return (
    <span className="team-monogram" aria-hidden="true">
      {src ? (
        <Image
          key={src}
          src={src}
          width={64}
          height={64}
          unoptimized
          alt=""
          onError={() => setFailed((urls) => [...urls, src])}
        />
      ) : (
        teamInitials(team.name)
      )}
    </span>
  );
}
