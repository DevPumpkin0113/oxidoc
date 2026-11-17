import { invoke, isTauri } from "@tauri-apps/api/core";
import { normalizeFontFamily } from "./store";

/** An installed font family (see `fonts.rs`). */
export interface FontFamily {
  name: string;
  aliases: string[];
  monospace: boolean;
}

const MAX_SUGGESTIONS = 100;
let loading: Promise<FontFamily[]> | null = null;

/**
 * Installed families, monospace first; empty outside the desktop app. The
 * scan takes about a second, so the first call starts it and later calls
 * share the result.
 */
export function loadSystemFonts(): Promise<FontFamily[]> {
  if (!isTauri()) return Promise.resolve([]);
  loading ??= invoke<FontFamily[]>("system_fonts").then(
    (families) => (Array.isArray(families) ? families : []),
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** A family name as written in a CSS list, quoted unless it is plain words. */
export function cssFamilyName(name: string) {
  const plain = name
    .split(" ")
    .every(
      (word) => /^[\p{L}_-][\p{L}\p{N}_-]*$/u.test(word) && !/^-\d/.test(word),
    );
  return plain ? name : `'${name}'`;
}

/** Families that fit the setting's allowed characters. */
export const pickable = (families: FontFamily[]) =>
  families.filter(
    (family) =>
      !family.name.includes("'") &&
      normalizeFontFamily(cssFamilyName(family.name)) !== null,
  );

/** The comma-separated entry around `caret`: its bounds and unquoted text. */
export function segmentAt(text: string, caret: number) {
  const start = text.lastIndexOf(",", Math.max(0, caret - 1)) + 1;
  const next = text.indexOf(",", caret);
  const end = next < 0 ? text.length : next;
  const query = text
    .slice(start, end)
    .trim()
    .replace(/^['"]|['"]$/g, "");
  return { start, end, query };
}

/** `text` with the entry around `caret` replaced by `name`; and the new caret. */
export function replaceSegment(text: string, caret: number, name: string) {
  const { start, end } = segmentAt(text, caret);
  const before = text.slice(0, start).replace(/\s*$/, "");
  const after = text.slice(end).replace(/^\s*/, "");
  const inserted = (before ? " " : "") + cssFamilyName(name);
  const result = before + inserted + after;
  return { text: result, caret: (before + inserted).length };
}

/** Families matching `query` by name or alias; prefix matches first. */
export function suggestFonts(families: FontFamily[], query: string) {
  const wanted = query.trim().toLocaleLowerCase();
  if (!wanted) return families.slice(0, MAX_SUGGESTIONS);
  const names = (family: FontFamily) =>
    [family.name, ...family.aliases].map((name) => name.toLocaleLowerCase());
  const prefix: FontFamily[] = [];
  const contains: FontFamily[] = [];
  for (const family of families) {
    const all = names(family);
    if (all.some((name) => name.startsWith(wanted))) prefix.push(family);
    else if (all.some((name) => name.includes(wanted))) contains.push(family);
  }
  return [...prefix, ...contains].slice(0, MAX_SUGGESTIONS);
}
