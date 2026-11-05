import { vi } from "vitest";
import type { PoolClient } from "pg";
import { getPool } from "../src/db";
type Spy = {
  mock: { calls: unknown[][]; results: { type: string; value: unknown }[] };
  mockRestore: () => void;
};
export async function observe<T>(run: () => Promise<T>) {
  const spies: Spy[] = [],
    seen = new Set<PoolClient>(),
    pool = getPool();
  const acquired = (client: PoolClient) => {
    if (!seen.has(client)) {
      seen.add(client);
      spies.push(vi.spyOn(client, "query"));
    }
  };
  pool.on("acquire", acquired);
  try {
    const value = await run();
    const statements = spies.flatMap((s) =>
      s.mock.calls.map(([q]) =>
        typeof q === "string"
          ? q
          : typeof q === "object" && q && "text" in q
            ? String(q.text)
            : "",
      ),
    );
    let bytes = 0;
    for (const s of spies)
      for (const r of s.mock.results)
        if (r.type === "return") {
          const result = await r.value;
          if (result && typeof result === "object" && "rows" in result)
            bytes += Buffer.byteLength(JSON.stringify(result.rows));
        }
    return { value, statements, bytes };
  } finally {
    pool.removeListener("acquire", acquired);
    for (const s of spies) s.mockRestore();
  }
}
// Detect projected JSONB values, not a boolean test of whether published is null.
export const sourceJson = (statements: string[]) =>
  statements.filter((s) => {
    if (!s.includes('from "historical_statistics"')) return false;
    const projection = s
      .slice(0, s.indexOf(" from "))
      .replace(/^select\s+/, "");
    return /(?:^|,\s*)(?:"historical_statistics"\.)?"(?:draft|published)"(?:\s*,|\s*$)/.test(
      projection,
    );
  });
