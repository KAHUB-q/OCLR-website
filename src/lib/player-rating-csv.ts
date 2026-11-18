import { HttpError } from "./http-error";
import { etxCsvColumns, etxMods, type EtxModPatch } from "./etx-rating-model";

function invalidCsv(): never {
  throw new HttpError(
    400,
    "Upload a valid CSV export for the selected rating source.",
  );
}

function csvRows(contents: string) {
  const text = contents.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (char === "," || char === "\r" || char === "\n") {
      row.push(field);
      field = "";
      closed = false;
      if (char !== ",") {
        rows.push(row);
        row = [];
        if (char === "\r" && text[index + 1] === "\n") index++;
      }
    } else if (char === '"' && !field && !closed) {
      quoted = true;
    } else {
      if (closed || char === '"') invalidCsv();
      field += char;
    }
  }
  if (quoted) invalidCsv();
  if (row.length || field || closed) rows.push([...row, field]);
  return rows;
}

function flag(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["", "0", "false"].includes(normalized)) return false;
  if (["1", "true"].includes(normalized)) return true;
  return invalidCsv();
}

function stars(cell: string) {
  const raw = cell.trim();
  if (raw === "" || /^nan$/i.test(raw)) return null;
  const value = Number(raw);
  if (
    !/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(raw) ||
    !Number.isFinite(value) ||
    value < 0
  )
    invalidCsv();
  return value;
}

type RatingRow = {
  identity: string;
  row: number;
  value: number | null;
  provisional: boolean;
  outdated: boolean;
  mods?: EtxModPatch;
};

export function parsePlayerRatingCsv(contents: string) {
  const [first, ...rows] = csvRows(contents);
  if (!first) invalidCsv();
  const header = first.map((cell) => cell.trim().toLowerCase());
  if (new Set(header).size !== header.length) invalidCsv();
  const identityIndex = header.indexOf("osuuserid");
  const valueIndex = header.indexOf("duelrating");
  if (identityIndex < 0 || valueIndex < 0 || rows.length > 50_000) invalidCsv();
  const flagIndex = (key: string) => {
    const legacy = header.indexOf(key);
    const current = header.indexOf(`duel${key}`);
    if (legacy >= 0 && current >= 0) invalidCsv();
    return current >= 0 ? current : legacy;
  };
  const columns = etxMods
    .map((mod) => ({
      mod,
      index: header.indexOf(etxCsvColumns[mod].toLowerCase()),
    }))
    .filter((column) => column.index >= 0);
  const seen = new Map<string, RatingRow>();
  const provisionalIndex = flagIndex("provisional");
  const outdatedIndex = flagIndex("outdated");
  return rows.flatMap((row, index) => {
    if (row.every((cell) => !cell.trim())) return [];
    if (row.length !== header.length) invalidCsv();
    const identity = row[identityIndex].trim();
    if (!/^[1-9]\d*$/.test(identity) || !Number.isSafeInteger(Number(identity)))
      invalidCsv();
    const parsed: RatingRow = {
      identity,
      value: stars(row[valueIndex]),
      row: index + 2,
      provisional: flag(row[provisionalIndex] ?? ""),
      outdated: flag(row[outdatedIndex] ?? ""),
    };
    if (columns.length) {
      parsed.mods = {};
      for (const column of columns)
        parsed.mods[column.mod] = stars(row[column.index]);
    }
    const previous = seen.get(identity);
    if (
      previous &&
      (previous.value !== parsed.value ||
        previous.provisional !== parsed.provisional ||
        previous.outdated !== parsed.outdated ||
        columns.some(({ mod }) => previous.mods?.[mod] !== parsed.mods?.[mod]))
    )
      throw new HttpError(
        400,
        "The CSV contains conflicting ratings for the same player.",
      );
    seen.set(identity, parsed);
    return [parsed];
  });
}
