import type { Edition } from "./editions";

/** Keep date semantics when removing the editor's local row identities. */
export function milestonePayload(
  rows: (Edition["schedule"][number] & { id?: number })[],
): Edition["schedule"] {
  return rows.map((s) => {
    if (s.kind === "exhibition")
      return { kind: s.kind, label: s.label, at: s.at };
    return {
      label: s.label,
      at: s.at,
      ...(s.precision ? { precision: s.precision } : {}),
      ...(s.kind ? { kind: s.kind, endAt: s.endAt ?? null } : {}),
    };
  });
}
