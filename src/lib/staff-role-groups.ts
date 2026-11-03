type Assignment = {
  grant: {
    userId: number;
    editionSlug: string | null;
    grantedAt: Date;
    revokedAt: Date | null;
  };
};

/** Keep each user/scope in its original position when its active roles change. */
export function groupStaffRoleAssignments<T extends Assignment>(
  grants: readonly T[],
): [string, T[]][] {
  const groups = new Map<string, { firstGrantedAt: number; rows: T[] }>();
  for (const row of grants) {
    const key = `${row.grant.userId}:${row.grant.editionSlug ?? ""}`;
    const grantedAt = row.grant.grantedAt.getTime();
    const group = groups.get(key) ?? { firstGrantedAt: grantedAt, rows: [] };
    // Revoked grants retain the group's history even when every role is replaced.
    group.firstGrantedAt = Math.min(group.firstGrantedAt, grantedAt);
    if (!row.grant.revokedAt) group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups]
    .filter(([, group]) => group.rows.length)
    .sort(
      ([leftKey, left], [rightKey, right]) =>
        right.firstGrantedAt - left.firstGrantedAt ||
        (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0),
    )
    .map(([key, group]) => [key, group.rows]);
}
