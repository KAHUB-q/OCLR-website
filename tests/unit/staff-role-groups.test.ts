import { describe, expect, it } from "vitest";
import { groupStaffRoleAssignments } from "../../src/lib/staff-role-groups";

function row(
  userId: number,
  date: string,
  role = "designer",
  editionSlug: string | null = null,
  revoked = false,
) {
  return {
    username: `Synthetic ${userId}`,
    grant: {
      userId,
      role,
      editionSlug,
      grantedAt: new Date(`${date}T00:00:00Z`),
      revokedAt: revoked ? new Date("2026-11-03T00:00:00Z") : null,
    },
  };
}

const keys = (rows: ReturnType<typeof row>[]) =>
  groupStaffRoleAssignments(rows).map(([key]) => key);

describe("staff assignment positions", () => {
  const earlier = row(100, "2026-10-01");
  const later = row(200, "2026-10-02");

  it("keeps an existing card in place when adding a newer role", () => {
    const before = keys([later, earlier]);
    expect(before).toEqual(["200:", "100:"]);
    expect(keys([row(100, "2026-11-03", "referee"), later, earlier])).toEqual(
      before,
    );
  });

  it("retains the original position when the oldest role is revoked or all roles are replaced", () => {
    const revoked = {
      ...earlier,
      grant: { ...earlier.grant, revokedAt: new Date() },
    };
    const replacement = row(100, "2026-11-03", "referee");
    const groups = groupStaffRoleAssignments([replacement, later, revoked]);
    expect(groups.map(([key]) => key)).toEqual(keys([later, earlier]));
    expect(groups[1][1]).toEqual([replacement]);
  });

  it("omits fully revoked groups and restores their historical position on regrant", () => {
    const revoked = row(100, "2026-10-01", "designer", null, true);
    expect(keys([later, revoked])).toEqual(["200:"]);
    expect(keys([row(100, "2026-11-03", "tester"), later, revoked])).toEqual([
      "200:",
      "100:",
    ]);
  });

  it("keeps global and edition groups independent, including an edition named global", () => {
    const assignments = [
      row(100, "2026-11-03", "referee", "cup"),
      row(100, "2026-10-03", "designer", "global"),
      row(100, "2026-10-02", "tester", "cup"),
      earlier,
    ];
    expect(keys(assignments)).toEqual(["100:global", "100:cup", "100:"]);
    expect(
      keys(
        assignments.filter(
          ({ grant }) => !grant.editionSlug || grant.editionSlug === "cup",
        ),
      ),
    ).toEqual(["100:cup", "100:"]);
  });

  it("breaks equal creation-time ties consistently regardless of incoming row order", () => {
    const sameTime = [row(200, "2026-10-01"), earlier];
    expect(keys(sameTime)).toEqual(keys([...sameTime].reverse()));
    expect(groupStaffRoleAssignments([])).toEqual([]);
  });
});
