/** Match conditions shared by project search and replace (see `query.rs`). */
export interface SearchOptions {
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
  /** Comma-separated globs; empty means every file. */
  include: string;
  exclude: string;
}

export const defaultSearchOptions: SearchOptions = {
  caseSensitive: false,
  regex: false,
  wholeWord: false,
  include: "",
  exclude: "",
};

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Splits a comma-separated pattern list, dropping empty entries. */
export const patternList = (list: string) =>
  list
    .split(",")
    .map((pattern) => pattern.trim())
    .filter(Boolean);

/**
 * Same glob rules as the desktop search: patterns without `/` match a file or
 * folder name at any depth, patterns with `/` start at the project root, and a
 * matching folder covers everything inside it.
 */
function globSource(glob: string) {
  const trimmed = glob
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+|\/+$/g, "");
  let source = "";
  for (let index = 0; index < trimmed.length; index++) {
    const char = trimmed[index];
    if (char === "*" && trimmed[index + 1] === "*") {
      index++;
      if (trimmed[index + 1] === "/") {
        index++;
        source += "(?:.*/)?";
      } else source += ".*";
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += escapeRegExp(char);
  }
  return `${trimmed.includes("/") ? "" : "(?:.*/)?"}${source}(?:/.*)?`;
}

function globMatcher(list: string) {
  const globs = patternList(list);
  return globs.length
    ? new RegExp(`^(?:${globs.map(globSource).join("|")})$`, "iu")
    : null;
}

/** Whether a root-relative path passes the include and exclude patterns. */
export function pathFilter(options: SearchOptions) {
  const include = globMatcher(options.include);
  const exclude = globMatcher(options.exclude);
  return (path: string) =>
    (!include || include.test(path)) && !exclude?.test(path);
}

/**
 * Browser equivalent of the desktop matcher, used for the sample workspace.
 * Throws on an invalid regular expression.
 */
export function queryPattern(query: string, options: SearchOptions) {
  const source = options.regex ? query : escapeRegExp(query);
  return new RegExp(
    options.wholeWord
      ? `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
      : source,
    `gmu${options.caseSensitive ? "" : "i"}`,
  );
}

const SHORTCUT_KEYS = {
  KeyC: "caseSensitive",
  KeyW: "wholeWord",
  KeyR: "regex",
} as const;

/**
 * Options after an Alt C / Alt W / Alt R toggle (as in VS Code), or `null`
 * when the key is not one of them.
 */
export function toggledByShortcut(
  event: Pick<
    KeyboardEvent,
    "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "code"
  >,
  options: SearchOptions,
): SearchOptions | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
    return null;
  const key = SHORTCUT_KEYS[event.code as keyof typeof SHORTCUT_KEYS];
  return key ? { ...options, [key]: !options[key] } : null;
}

/** Short labels of the conditions that differ from the defaults. */
export function activeConditions(options: SearchOptions) {
  return {
    flags: [
      options.caseSensitive && "대소문자 구분",
      options.wholeWord && "단어 단위",
      options.regex && "정규식",
    ].filter((flag): flag is string => Boolean(flag)),
    include: patternList(options.include).join(", "),
    exclude: patternList(options.exclude).join(", "),
  };
}
