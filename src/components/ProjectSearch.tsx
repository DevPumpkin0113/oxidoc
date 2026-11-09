import { translateError, t } from "../settings/i18n";
import { useEffect, useMemo, useState } from "react";
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

const EMPTY_RESULTS: SearchResults = {
  matches: [],
  truncated: false,
  skipped: 0,
};

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
  const [query, setQuery] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const [response, setResponse] = useState<{
    key: string;
    results: SearchResults;
    error?: string;
  }>();
  const requestKey = JSON.stringify([root, desktop, query, sensitive, folder]);
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
        ? workspaceApi.advanced!.search(root, query, sensitive, folder)
        : Promise.resolve({
            matches: sampleDocuments
              .filter(
                (document) => !folder || document.id.startsWith(folder + "/"),
              )
              .flatMap((document) =>
                document.content.split("\n").flatMap((text, index) => {
                  const column = (
                    sensitive ? text : text.toLowerCase()
                  ).indexOf(sensitive ? query : query.toLowerCase());
                  return column < 0
                    ? []
                    : [
                        {
                          path: document.id,
                          name: document.name,
                          line: index + 1,
                          column: column + 1,
                          text,
                        },
                      ];
                }),
              ),
            truncated: false,
            skipped: 0,
          });
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
  }, [root, desktop, query, sensitive, folder, requestKey]);

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
            ref={inputRef}
            id="document-search"
            placeholder={t("파일 내용 검색")}
            value={query}
            disabled={!root}
            onChange={(event) => setQuery(event.target.value)}
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
        </div>
        <div className={styles.options}>
          <label className={styles.caseOption} data-checked={sensitive}>
            <input
              type="checkbox"
              checked={sensitive}
              disabled={!root}
              onChange={(event) => setSensitive(event.target.checked)}
            />
            <span>{t("대소문자 구분")}</span>
          </label>
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
                            {match.text.slice(start, start + query.length)}
                          </mark>
                          {match.text.slice(start + query.length)}
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
