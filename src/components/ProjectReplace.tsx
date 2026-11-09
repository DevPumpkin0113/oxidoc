import {
  lazy,
  Suspense,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  workspaceApi,
  type Replacement,
  type ReplaceResult,
} from "../workspace/api";
import { useWorkspace } from "../workspace/store";
import { t, translateError } from "../settings/i18n";
import Icon from "./Icon";
import { FileIcon } from "./FileIcon";
import base from "../App.module.css";
import styles from "./ProjectReplace.module.css";

const ReplacementDiff = lazy(() => import("./ReplacementDiff"));

export default function ProjectReplace({
  root,
  suspended,
  onClose,
}: {
  root: string;
  suspended: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const [files, setFiles] = useState<Replacement[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<string | null>(null);
  const [sideBySide, setSideBySide] = useState(true);
  const [operation, setOperation] = useState<"preview" | "apply" | null>(null);
  const [previewed, setPreviewed] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<ReplaceResult[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const selectAll = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const working = operation !== null;
  const allSelected = files.length > 0 && selected.size === files.length;
  const selectedChanges = files.reduce(
    (count, file) => count + (selected.has(file.path) ? file.count : 0),
    0,
  );
  const current = files.find((file) => file.path === shown);
  const failureCount = results.filter((result) => result.error).length;
  const projectName =
    root.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? root;

  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => {
      mounted.current = false;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate = selected.size > 0 && !allSelected;
  }, [selected, allSelected]);
  const escape = useEffectEvent((event: KeyboardEvent) => {
    if (
      !suspended &&
      !working &&
      event.key === "Escape" &&
      !event.isComposing
    ) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  });
  useEffect(() => {
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, []);

  function invalidate() {
    setFiles([]);
    setSelected(new Set());
    setShown(null);
    setResults([]);
    setNotice("");
    setError("");
    setPreviewed(false);
  }
  async function preview() {
    if (!query || working) return;
    invalidate();
    setOperation("preview");
    try {
      const result = await workspaceApi.advanced!.previewReplace(
        root,
        query,
        replacement,
        sensitive,
      );
      if (!mounted.current || useWorkspace.getState().project?.path !== root)
        return;
      setFiles(result.files);
      setSelected(new Set(result.files.map((file) => file.path)));
      setShown(result.files[0]?.path ?? null);
      setPreviewed(true);
      if (result.truncated || result.skipped)
        setNotice(
          t(
            "일부 파일이 제외되었습니다. 검색어를 좁혀 다시 확인할 수 있습니다.",
          ),
        );
    } catch (error) {
      if (mounted.current) setError(String(error));
    } finally {
      if (mounted.current) setOperation(null);
    }
  }
  async function apply() {
    if (
      working ||
      !selected.size ||
      useWorkspace.getState().project?.path !== root
    )
      return;
    setOperation("apply");
    setError("");
    try {
      const results = await useWorkspace
        .getState()
        .applyReplacements(files.filter((file) => selected.has(file.path)));
      if (!mounted.current) return;
      const failed = new Set(
        results.filter((result) => result.error).map((result) => result.path),
      );
      const remaining = files.filter(
        (file) => !selected.has(file.path) || failed.has(file.path),
      );
      setResults(results);
      setSelected(failed);
      setFiles(remaining);
      setShown((current) =>
        remaining.some((file) => file.path === current)
          ? current
          : (remaining[0]?.path ?? null),
      );
    } catch (error) {
      if (mounted.current) setError(String(error));
    } finally {
      if (mounted.current) setOperation(null);
    }
  }

  return (
    <div
      className={`${base.modalBackdrop} ${styles.backdrop}`}
      inert={suspended}
    >
      <div
        ref={panel}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-replace-title"
        aria-busy={working}
        onKeyDownCapture={(event) => {
          if (event.key !== "Tab") return;
          const controls = [
            ...(panel.current?.querySelectorAll<HTMLElement>(
              "[data-replace-control]:not(:disabled)",
            ) ?? []),
          ];
          const index = controls.findIndex(
            (control) =>
              control === document.activeElement ||
              control.contains(document.activeElement),
          );
          event.preventDefault();
          event.stopPropagation();
          const next =
            index < 0
              ? event.shiftKey
                ? controls.length - 1
                : 0
              : (index + (event.shiftKey ? -1 : 1) + controls.length) %
                controls.length;
          controls[next]?.focus();
        }}
      >
        <header className={styles.header}>
          <span className={styles.headerIcon}>
            <Icon name="replace" size={21} />
          </span>
          <div className={styles.heading}>
            <h2 id="project-replace-title">{t("프로젝트 전체 바꾸기")}</h2>
            <span title={root}>
              <Icon name="folder" size={12} />
              {projectName}
            </span>
          </div>
          <button
            data-replace-control
            className={styles.close}
            disabled={working}
            aria-label={t("닫기")}
            title={`${t("닫기")} (Esc)`}
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <form
          className={styles.fields}
          onSubmit={(event) => {
            event.preventDefault();
            void preview();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing)
              event.preventDefault();
          }}
        >
          <label className={styles.field}>
            <span>{t("검색어")}</span>
            <div className={styles.inputWrap}>
              <Icon name="search" size={15} />
              <input
                data-replace-control
                ref={input}
                aria-label={t("검색어")}
                placeholder={t("찾을 내용")}
                value={query}
                disabled={working}
                onChange={(event) => {
                  setQuery(event.target.value);
                  invalidate();
                }}
              />
            </div>
          </label>
          <label className={styles.field}>
            <span>{t("대체어")}</span>
            <div className={styles.inputWrap}>
              <Icon name="replace" size={15} />
              <input
                data-replace-control
                aria-label={t("대체어")}
                placeholder={t("바꿀 내용 · 비워 두면 삭제")}
                value={replacement}
                disabled={working}
                onChange={(event) => {
                  setReplacement(event.target.value);
                  invalidate();
                }}
              />
            </div>
          </label>
          <label className={styles.caseOption} data-checked={sensitive}>
            <input
              data-replace-control
              type="checkbox"
              checked={sensitive}
              disabled={working}
              onChange={(event) => {
                setSensitive(event.target.checked);
                invalidate();
              }}
            />
            <span>{t("대소문자 구분")}</span>
          </label>
          <button
            data-replace-control
            className={styles.previewButton}
            type="submit"
            disabled={working || !query}
          >
            <Icon
              name={operation === "preview" ? "refresh" : "search"}
              size={15}
            />
            {t(operation === "preview" ? "미리보기 중…" : "변경 미리보기")}
          </button>
        </form>
        {error ? (
          <div className={styles.error} role="alert">
            <Icon name="warning" size={15} />
            <span>{translateError(error)}</span>
          </div>
        ) : null}
        {notice ? (
          <div className={styles.notice}>
            <Icon name="bell" size={14} />
            <span>{notice}</span>
          </div>
        ) : null}

        <div className={styles.body}>
          <aside className={styles.filePanel} aria-label={t("변경 파일")}>
            <div className={styles.fileToolbar}>
              <label>
                <input
                  data-replace-control
                  ref={selectAll}
                  type="checkbox"
                  aria-label={t("전체 선택")}
                  checked={allSelected}
                  disabled={working || !files.length}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? new Set(files.map((file) => file.path))
                        : new Set(),
                    )
                  }
                />
                <span>{t("변경 파일")}</span>
              </label>
              <span className={styles.fileCount}>{files.length}</span>
            </div>
            <div className={styles.fileList}>
              {files.map((file) => {
                const name = file.path.split("/").pop() ?? file.path;
                const folder = file.path.split("/").slice(0, -1).join("/");
                return (
                  <div
                    className={styles.fileRow}
                    data-active={shown === file.path}
                    key={file.path}
                  >
                    <input
                      data-replace-control
                      type="checkbox"
                      aria-label={t("{0} 선택", file.path)}
                      checked={selected.has(file.path)}
                      disabled={working}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(file.path);
                          else next.delete(file.path);
                          return next;
                        })
                      }
                    />
                    <button
                      data-replace-control
                      className={styles.fileButton}
                      type="button"
                      title={file.path}
                      aria-label={file.path}
                      aria-pressed={shown === file.path}
                      onClick={() => setShown(file.path)}
                    >
                      <FileIcon name={name} size={16} />
                      <span className={styles.fileName}>
                        <strong>{name}</strong>
                        <small>{folder || t("프로젝트 루트")}</small>
                      </span>
                      <span
                        className={styles.changeCount}
                        title={t("{0}곳 변경", file.count)}
                      >
                        {file.count}
                      </span>
                    </button>
                  </div>
                );
              })}
              {!files.length ? (
                <p className={styles.noFiles}>
                  {t(previewed ? "변경할 파일 없음" : "미리보기 대기")}
                </p>
              ) : null}
            </div>
          </aside>

          <section
            className={styles.previewPanel}
            aria-label={t("변경 차이 미리보기")}
          >
            <div className={styles.previewToolbar}>
              <span className={styles.currentPath} title={current?.path}>
                {current ? (
                  <>
                    <FileIcon name={current.path} size={15} />
                    {current.path}
                  </>
                ) : (
                  t("변경 차이 미리보기")
                )}
              </span>
              {current ? (
                <div
                  className={styles.viewOptions}
                  role="group"
                  aria-label={t("차이 보기 방식")}
                >
                  <button
                    data-replace-control
                    type="button"
                    aria-label={t("나란히 보기")}
                    title={t("나란히 보기")}
                    aria-pressed={sideBySide}
                    onClick={() => setSideBySide(true)}
                  >
                    <Icon name="split" size={15} />
                  </button>
                  <button
                    data-replace-control
                    type="button"
                    aria-label={t("통합 보기")}
                    title={t("통합 보기")}
                    aria-pressed={!sideBySide}
                    onClick={() => setSideBySide(false)}
                  >
                    <Icon name="code" size={15} />
                  </button>
                </div>
              ) : null}
            </div>
            {current ? (
              <>
                <div className={styles.legend}>
                  <span>
                    <i className={styles.removed}>−</i>
                    {t("변경 전")}
                  </span>
                  <span>
                    <i className={styles.added}>+</i>
                    {t("변경 후")}
                  </span>
                  <small>{t("읽기 전용")}</small>
                </div>
                <Suspense
                  fallback={
                    <div className={styles.empty}>
                      <Icon name="refresh" />
                      <span>{t("차이 미리보기 준비 중…")}</span>
                    </div>
                  }
                >
                  <ReplacementDiff
                    before={current.before}
                    after={current.after}
                    sideBySide={sideBySide}
                  />
                </Suspense>
              </>
            ) : (
              <div className={styles.empty} role="status">
                <span
                  className={`${styles.emptyIcon} ${operation === "preview" ? styles.spinning : ""}`}
                >
                  <Icon
                    name={
                      operation === "preview"
                        ? "refresh"
                        : results.length && !failureCount
                          ? "check"
                          : "replace"
                    }
                    size={28}
                  />
                </span>
                <strong>
                  {t(
                    operation === "preview"
                      ? "변경 내용을 확인하고 있습니다"
                      : results.length && !files.length
                        ? "선택한 변경을 적용했습니다"
                        : previewed
                          ? "바꿀 내용이 없습니다"
                          : "변경 내용을 먼저 확인하세요",
                  )}
                </strong>
                <p>
                  {t(
                    operation === "preview"
                      ? "프로젝트 파일을 확인하는 중입니다."
                      : results.length
                        ? "남은 변경을 확인하려면 미리보기를 다시 실행하세요."
                        : previewed
                          ? "검색어와 대체어를 확인해 주세요."
                          : "검색어와 대체어를 입력한 뒤 미리보기를 실행하세요.",
                  )}
                </p>
              </div>
            )}
          </section>
        </div>

        {results.length ? (
          <details
            className={styles.results}
            open={failureCount > 0}
            data-failed={failureCount > 0}
          >
            <summary data-replace-control>
              <Icon name={failureCount ? "warning" : "check"} size={14} />
              <span role="status">
                {t(
                  "적용 {0}개 · 실패 {1}개",
                  results.length - failureCount,
                  failureCount,
                )}
              </span>
              <small>{t("파일별 결과 보기")}</small>
              <Icon name="down" size={12} />
            </summary>
            <div>
              {results.map((result) => (
                <p data-failed={Boolean(result.error)} key={result.path}>
                  <Icon name={result.error ? "warning" : "check"} size={13} />
                  <span>{result.path}</span>
                  <small>
                    {result.error ? translateError(result.error) : t("완료")}
                  </small>
                </p>
              ))}
            </div>
          </details>
        ) : null}
        <footer className={styles.footer}>
          <div>
            <strong>
              {t(
                "선택 {0}개 파일 · {1}곳 변경",
                selected.size,
                selectedChanges,
              )}
            </strong>
            <small>{t("미저장 문서와 외부 변경은 보호됩니다.")}</small>
          </div>
          <button
            data-replace-control
            className={styles.applyButton}
            disabled={working || !selected.size}
            onClick={() => void apply()}
          >
            <Icon
              name={operation === "apply" ? "refresh" : "replace"}
              size={16}
            />
            {t(
              operation === "apply" ? "적용 중…" : "선택 적용 ({0})",
              selected.size,
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
