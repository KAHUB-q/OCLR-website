"use client";

import { useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { PublicGroup } from "@/lib/public-competition";
import type { publishedTeams } from "@/lib/team-reads";
import Link from "./pending-link";
import { PlayerCard } from "./player-card";
import { GroupStandings } from "./public-matches";
import { TeamAvatar } from "./team-avatar";

type PublishedTeam = Awaited<ReturnType<typeof publishedTeams>>[number];

function TeamSection({
  team,
  slug,
  groupName,
  position,
}: {
  team: PublishedTeam;
  slug: string;
  groupName?: string;
  position: number;
}) {
  const tr = useAppTranslations();
  const captain = { osuId: team.captainId, username: team.captainName };
  const members = team.members ?? [];
  const coaches = team.members ? team.coaches : [];
  const coachIds = new Set(coaches.map((coach) => coach.osuId));
  const players = new Map(
    [captain, ...members, ...coaches].map((person) => [person.osuId, person]),
  );

  return (
    <section className="archive-team-section">
      <h2 className="team-directory-heading">
        <span className="muted">#{position}</span>
        {team.avatarKey && <TeamAvatar team={team} />}
        <Link href={`/tournaments/${slug}/teams/${team.id}`}>{team.name}</Link>
        {groupName && <span className="badge">{groupName}</span>}
      </h2>
      <ul className="archive-player-grid">
        {Array.from(players.values(), (person) => {
          const isCaptain = person.osuId === team.captainId;
          const isCoach = coachIds.has(person.osuId);
          const roles = [isCaptain && "Captain", isCoach && tr("Coach")];
          return (
            <PlayerCard
              key={person.osuId}
              osuId={person.osuId}
              username={person.username}
              profileHref={`/players/${person.osuId}?edition=${slug}`}
              roleCode={isCaptain ? "captain" : isCoach ? "coach" : "player"}
              roleLabel={roles.filter(Boolean).join(" · ")}
            />
          );
        })}
      </ul>
      {team.members === null && (
        <p className="muted small">{tr("Roster awaiting publication")}</p>
      )}
    </section>
  );
}

export function PublicTeams({
  teams,
  groups,
  slug,
}: {
  teams: PublishedTeam[];
  groups: PublicGroup[];
  slug: string;
}) {
  const tr = useAppTranslations();

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const term = search.trim().toLocaleLowerCase();
  const selected = groups.find((g) => g.key === group);
  const filtered = teams
    .map((team, index) => ({ team, position: index + 1 }))
    .filter(
      ({ team: t }) =>
        (!selected || selected.rows.some((r) => r.team.id === t.id)) &&
        (!term ||
          [
            t.name,
            t.captainName,
            t.captainId,
            ...(t.members ? t.coaches : []).flatMap((c) => [
              c.username,
              c.osuId,
            ]),
            ...(t.members ?? []).flatMap((m) => [m.username, m.osuId]),
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(term)),
    );
  return (
    <>
      <div className="team-browse-toolbar">
        {groups.length > 0 && (
          <div
            className="event-pills"
            role="group"
            aria-label={tr("Team groups")}
          >
            {[["", "All teams"], ...groups.map((g) => [g.key, g.name])].map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="secondary"
                  aria-pressed={group === value}
                  onClick={() => setGroup(value)}
                >
                  {value ? label : tr("All teams")}
                </button>
              ),
            )}
          </div>
        )}
        <label className="field">
          <span>{tr("Search teams")}</span>
          <input
            type="search"
            placeholder={tr("Team, captain or published player")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <p className="muted small" role="status">
        {filtered.length} / {teams.length} {tr(" teams")}
      </p>
      <div
        className={`public-team-workspace${groups.length ? " with-standings" : ""}`}
      >
        <div className="stack">
          {filtered.map(({ team, position }) => (
            <TeamSection
              key={team.id}
              team={team}
              position={position}
              slug={slug}
              groupName={
                groups.find((g) => g.rows.some((r) => r.team.id === team.id))
                  ?.name
              }
            />
          ))}
          {!filtered.length && (
            <p className="notice">{tr("No teams match this search.")}</p>
          )}
        </div>
        {groups.length > 0 && (
          <aside className="team-standings">
            <GroupStandings groups={groups} slug={slug} />
          </aside>
        )}
      </div>
    </>
  );
}
