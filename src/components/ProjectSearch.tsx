import { translateError, t } from "../settings/i18n";
import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useUi, type SearchState } from "../workbench/uiStore";
import {
  workspaceApi,
  type SearchResults,
  type SearchMatch,
} from "../workspace/api";
import { useWorkspace } from "../workspace/store";
import { sampleDocuments } from "../data/sampleDocuments";
import Icon from "./Icon";
import { FileIcon } from "./FileIcon";
import styles from "./ProjectSearch.module.css";
import { FilePatterns, SearchToggles } from "./SearchConditions";
import {
  activeConditions,
  pathFilter,
  queryPattern,
  toggledByShortcut,
  type SearchOptions,
} from "../workspace/searchOptions";

const EMPTY_RESULTS: SearchResults = {
  matches: [],
  truncated: false,
  skipped: 0,
};

// Kept in the workbench store so switching sidebar views keeps the search.
const setSearch = (patch: Partial<SearchState>) =>
  useUi.setState((state) => ({ search: { ...state.search, ...patch } }));
const setQuery = (query: string) => setSearch({ query });
const setOptions = (options: SearchOptions) => setSearch({ options });
const setResponse = (response: SearchState["response"]) =>
  setSearch({ response });
const togglePatterns = () =>
  setSearch({ showPatterns: !useUi.getState().search.showPatterns });
// Bumped by the refresh button to repeat the same search.
const refresh = () =>
  setSearch({ revision: useUi.getState().search.revision + 1 });

export default function ProjectSearch({
  onResult,
  inputRef,
  folder = "",
  onClearFolder,
  onReplace,
}: {
  onResult: (match: SearchMatch) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  folder?: string;
  onClearFolder?: () => void;
  onReplace?: () => void;
}) {
  const root = useWorkspace((state) => state.project?.path);
  const desktop = useWorkspace((state) => state.desktop);
  const { query, options, showPatterns, revision, response } = useUi(
    useShallow((state) => state.search),
  );
  const requestKey = JSON.stringify([
    root,
    desktop,
    query,
    options,
    folder,
    revision,
  ]);
  const conditions = activeConditions(options);
  const patternsActive = Boolean(conditions.include || conditions.exclude);
  const current = response?.key === requestKey ? response : undefined;
  const results = current?.results ?? EMPTY_RESULTS;
  const error = current?.error;
  const loading = Boolean(query && root && !current);
  const groups = useMemo(() => {
    const grouped = new Map<
      string,
      { name: string; path: string; matches: SearchMatch[] }
    >();
    for (const match of results.matches) {
      const group = grouped.get(match.path);
      if (group) group.matches.push(match);
      else
        grouped.set(match.path, {
          name: match.name,
          path: match.path,
          matches: [match],
        });
    }
    return [...grouped.values()];
  }, [results]);

  useEffect(() => {
    if (!query || !root) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const searching = desktop
        ? workspaceApi.advanced!.search(root, query, options, folder)
        : sampleSearch(query, options, folder);
      void searching
        .then((results) => {
          if (!cancelled) setResponse({ key: requestKey, results });
        })
        .catch((error) => {
          if (!cancelled)
            setResponse({
              key: requestKey,
              results: EMPTY_RESULTS,
              error: String(error),
            });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [root, desktop, query, options, folder, requestKey]);

  return (
    <div className={styles.panel}>
      <div className={styles.controls}>
        <div className={styles.heading}>
          <label htmlFor="document-search">{t("프로젝트 전체 검색")}</label>
          {desktop && onReplace ? (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={t("프로젝트 전체 바꾸기")}
              title={`${t("프로젝트 전체 바꾸기")} (Ctrl Shift H)`}
              disabled={!root}
              onClick={onReplace}
            >
              <Icon name="replace" size={16} />
            </button>
          ) : null}
        </div>
        <div className={styles.inputWrap}>
          <span className={loading ? styles.spinning : undefined}>
            <Icon name={loading ? "refresh" : "search"} size={14} />
          </span>
          <input
            autoComplete="off"
            ref={inputRef}
            id="document-search"
            placeholder={t("파일 내용 검색")}
            value={query}
            disabled={!root}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              const next = toggledByShortcut(event, options);
              if (!next) return;
              event.preventDefault();
              setOptions(next);
            }}
          />
          {query ? (
            <button
              type="button"
              className={styles.clearButton}
              aria-label={t("검색어 지우기")}
              title={t("검색어 지우기")}
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              <Icon name="close" size={13} />
            </button>
          ) : null}
          <SearchToggles
            options={options}
            onChange={setOptions}
            disabled={!root}
          />
        </div>
        <div className={styles.options}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t("파일 조건")}
            aria-expanded={showPatterns}
            aria-controls="search-file-patterns"
            title={t("파일 조건")}
            data-active={patternsActive}
            disabled={!root}
            onClick={togglePatterns}
          >
            <Icon name={patternsActive ? "filterActive" : "filter"} size={14} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t("결과 새로고침")}
            title={t("결과 새로고침")}
            disabled={!query || !root || loading}
            onClick={refresh}
          >
            <Icon name="refresh" size={14} />
          </button>
          <span className={styles.count} role="status" aria-live="polite">
            {query && root
              ? loading
                ? t("검색 중…")
                : !error
                  ? t("{0}개 결과", results.matches.length)
                  : ""
              : ""}
          </span>
        </div>
        {showPatterns ? (
          <div id="search-file-patterns">
            <FilePatterns
              idPrefix="search"
              options={options}
              onChange={setOptions}
              disabled={!root}
            />
          </div>
        ) : null}
        {conditions.flags.length || patternsActive ? (
          <p className={styles.conditions} aria-label={t("검색 조건")}>
            {[
              ...conditions.flags.map((flag) => t(flag)),
              conditions.include && t("포함: {0}", conditions.include),
              conditions.exclude && t("제외: {0}", conditions.exclude),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        {folder ? (
          <div className={styles.scope}>
            <Icon name="folder" size={12} />
            <span title={folder}>{t("검색 폴더: {0}", folder)}</span>
            <button
              type="button"
              className={styles.clearButton}
              aria-label={t("전체 폴더에서 검색")}
              title={t("전체 폴더에서 검색")}
              onClick={onClearFolder}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ) : null}
      </div>
      {error ? (
        <div className={styles.error} role="alert">
          <Icon name="warning" size={14} />
          <span>{translateError(error)}</span>
        </div>
      ) : null}
      {!query || !root ? (
        <div className={styles.empty}>
          <Icon name="search" size={20} />
          <span>
            {t(root ? "검색어를 입력하세요." : "프로젝트를 먼저 열어 주세요.")}
          </span>
        </div>
      ) : null}
      {query && root && !loading && !error && !results.matches.length ? (
        <div className={styles.empty}>
          <Icon name="search" size={20} />
          <span>{t("검색 결과가 없습니다.")}</span>
        </div>
      ) : null}
      {groups.length ? (
        <div className={styles.results} aria-label={t("검색 결과")}>
          {groups.map((group) => (
            <details
              className={styles.fileGroup}
              open
              key={`${requestKey}:${group.path}`}
            >
              <summary title={group.path}>
                <Icon name="chevron" size={12} />
                <FileIcon name={group.name} size={15} />
                <span className={styles.fileName}>
                  <strong>{group.name}</strong>
                  <small>
                    {group.path.split("/").slice(0, -1).join("/") ||
                      t("프로젝트 루트")}
                  </small>
                </span>
                <span className={styles.matchCount}>
                  {group.matches.length}
                </span>
              </summary>
              {group.matches.map((match, index) => {
                const start = Math.max(0, match.column - 1);
                return (
                  <button
                    type="button"
                    className={styles.match}
                    key={`${match.line}:${match.column}:${index}`}
                    onClick={() => onResult(match)}
                    title={`${match.path}:${match.line}:${match.column}`}
                    aria-label={t(
                      "{0}, {1}행 {2}열: {3}",
                      `${match.name} (${match.path})`,
                      match.line,
                      match.column,
                      match.text,
                    )}
                  >
                    <span className={styles.lineNumber}>{match.line}</span>
                    <span className={styles.snippet}>
                      {start < match.text.length ? (
                        <>
                          {match.text.slice(0, start)}
                          <mark>
                            {match.text.slice(start, start + match.length)}
                          </mark>
                          {match.text.slice(start + match.length)}
                        </>
                      ) : (
                        match.text
                      )}
                    </span>
                  </button>
                );
              })}
            </details>
          ))}
        </div>
      ) : null}
      {results.truncated ? (
        <p className={styles.note}>
          {t(
            "최대 500개 결과 / 20,000개 항목 범위입니다. 검색어를 좁혀 주세요.",
          )}
        </p>
      ) : null}
      {results.skipped ? (
        <p className={styles.note}>
          {t(
            "읽을 수 없거나 지원 범위를 넘는 항목 {0}개 제외",
            results.skipped,
          )}
        </p>
      ) : null}
    </div>
  );
}

/** Search over the browser preview's sample documents. */
async function sampleSearch(
  query: string,
  options: SearchOptions,
  folder: string,
): Promise<SearchResults> {
  let pattern: RegExp;
  try {
    pattern = queryPattern(query, options);
  } catch (error) {
    return Promise.reject(
      new Error(`잘못된 정규식: ${(error as Error).message}`),
    );
  }
  const included = pathFilter(options);
  return {
    matches: sampleDocuments
      .filter(
        (document) =>
          (!folder || document.id.startsWith(folder + "/")) &&
          included(document.id),
      )
      .flatMap((document) =>
        document.content.split("\n").flatMap((text, index) =>
          [...text.matchAll(pattern)]
            .filter((found) => found[0])
            .map((found) => ({
              path: document.id,
              name: document.name,
              line: index + 1,
              column: found.index + 1,
              length: found[0].length,
              text,
            })),
        ),
      ),
    truncated: false,
    skipped: 0,
  };
}
