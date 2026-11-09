import { translateError, t } from "../settings/i18n";
import { useEffect, useRef, useState } from "react";
import {
  workspaceApi,
  type SearchResults,
  type SearchMatch,
} from "../workspace/api";
import { useWorkspace } from "../workspace/store";
import { sampleDocuments } from "../data/sampleDocuments";
import Icon from "./Icon";
import styles from "../App.module.css";
export default function ProjectSearch({
  onResult,
  inputRef,
  folder = "",
  onClearFolder,
}: {
  onResult: (match: SearchMatch) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  folder?: string;
  onClearFolder?: () => void;
}) {
  const { project, desktop } = useWorkspace();
  const [query, setQuery] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const [results, setResults] = useState<SearchResults>({
    matches: [],
    truncated: false,
    skipped: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!query || !project) {
        setResults({ matches: [], truncated: false, skipped: 0 });
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      const searching = desktop
        ? workspaceApi.advanced!.search(project.path, query, sensitive, folder)
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
        .then((result) => {
          if (!cancelled && generation.current === token) setResults(result);
        })
        .catch((error) => {
          if (!cancelled && generation.current === token)
            setError(String(error));
        })
        .finally(() => {
          if (!cancelled && generation.current === token) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      cancelled = true;
    };
  }, [query, sensitive, project, desktop, folder]);
  return (
    <div className={styles.searchPanel}>
      {folder ? (
        <div className={styles.searchScope}>
          <span title={folder}>{t("검색 폴더: {0}", folder)}</span>
          <button aria-label={t("전체 폴더에서 검색")} onClick={onClearFolder}>
            <Icon name="close" size={13} />
          </button>
        </div>
      ) : null}
      <label htmlFor="document-search">{t("프로젝트 전체 검색")}</label>
      <div className={styles.searchField}>
        <Icon name="search" size={15} />
        <input
          ref={inputRef}
          id="document-search"
          placeholder={t("파일 내용 검색")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <label className={styles.favoriteFilter}>
        <input
          type="checkbox"
          checked={sensitive}
          onChange={(event) => setSensitive(event.target.checked)}
        />
        {t("대소문자 구분")}
      </label>
      <p className={styles.resultCount}>
        {loading
          ? t("검색 중…")
          : query
            ? t("{0}개 결과", results.matches.length)
            : t("검색어를 입력하세요.")}
      </p>
      {error ? (
        <p className={styles.projectNote} role="alert">
          {translateError(error)}
        </p>
      ) : null}
      {results.matches.map((match, index) => (
        <button
          className={styles.searchResult}
          key={`${match.path}:${match.line}:${match.column}:${index}`}
          onClick={() => onResult(match)}
          title={`${match.path}:${match.line}:${match.column}`}
        >
          <strong>
            {match.name}
            <small>
              {match.line}:{match.column}
            </small>
          </strong>
          <span>{match.text}</span>
        </button>
      ))}
      {results.truncated ? (
        <p className={styles.projectNote}>
          {t(
            "최대 500개 결과 / 20,000개 항목 범위입니다. 검색어를 좁혀 주세요.",
          )}
        </p>
      ) : null}
      {results.skipped ? (
        <p className={styles.projectNote}>
          {t(
            "읽을 수 없거나 지원 범위를 넘는 항목 {0}개 제외",
            results.skipped,
          )}
        </p>
      ) : null}
      {query && !loading && !results.matches.length ? (
        <p className={styles.emptySearch}>{t("검색 결과가 없습니다.")}</p>
      ) : null}
    </div>
  );
}
