import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { t, translateError } from "../settings/i18n";
import type { ReplaceResult } from "../workspace/api";
import { isDirty, sameDocumentPath } from "../workspace/model";
import { useWorkspace } from "../workspace/store";
import {
  applyLinkUpdates,
  type LinkUpdateRequest,
} from "../workbench/linkUpdates";
import { FileIcon } from "./FileIcon";
import Icon from "./Icon";
import ScrollArea from "./ScrollArea";
import dialogStyles from "./dialog.module.css";
import styles from "./LinkUpdateDialog.module.css";

const ReplacementDiff = lazy(() => import("./ReplacementDiff"));

/** Why a file cannot be updated now, or `null` when it can. */
function blockedReason(path: string) {
  const document = useWorkspace
    .getState()
    .documents.find((item) => sameDocumentPath(item.id, path));
  if (!document) return null;
  if (document.diskContent !== undefined)
    return t("외부 변경을 확인하지 않은 열린 문서");
  if (isDirty(document)) return t("저장하지 않은 변경이 있는 열린 문서");
  return null;
}

/**
 * Asks how to handle links broken by a move: move and update the selected
 * files, move only, or cancel. Shows per-file results when an update fails.
 */
export default function LinkUpdateDialog({
  request,
  onClose,
}: {
  request: LinkUpdateRequest;
  onClose: () => void;
}) {
  const { move, updates } = request;
  const [blocked] = useState(
    () =>
      new Map(
        updates.flatMap((update) => {
          const reason = blockedReason(update.oldPath);
          return reason ? [[update.oldPath, reason] as const] : [];
        }),
      ),
  );
  const [selected, setSelected] = useState(
    () =>
      new Set(
        updates
          .filter((update) => !blocked.has(update.oldPath))
          .map((update) => update.oldPath),
      ),
  );
  const [shown, setShown] = useState(updates[0]?.oldPath);
  const [working, setWorking] = useState(false);
  const [results, setResults] = useState<ReplaceResult[] | null>(null);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const current = updates.find((update) => update.oldPath === shown);
  const linkCount = updates
    .filter((update) => selected.has(update.oldPath))
    .reduce((sum, update) => sum + update.count, 0);
  const failures = results?.filter((result) => result.error) ?? [];
  const name = move.to.split("/").pop() ?? move.to;

  useEffect(() => {
    dialog.current
      ?.querySelector<HTMLButtonElement>("[data-default-action]")
      ?.focus();
  }, []);

  function finish(moved: boolean) {
    request.resolve(moved);
    onClose();
  }
  async function run(updateLinks: boolean) {
    setWorking(true);
    setError("");
    const moved = await request.perform();
    if (!moved) {
      finish(false);
      return;
    }
    if (!updateLinks || !selected.size) {
      finish(true);
      return;
    }
    try {
      const applied = await applyLinkUpdates(
        updates.filter((update) => selected.has(update.oldPath)),
      );
      if (applied.every((result) => !result.error)) finish(true);
      else {
        setResults(applied);
        setWorking(false);
      }
    } catch (failure) {
      setError(String(failure));
      setResults([]);
      setWorking(false);
    }
  }

  return (
    <div className={dialogStyles.modalBackdrop}>
      <div
        ref={dialog}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-update-title"
        aria-busy={working}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !working) {
            event.preventDefault();
            finish(results !== null);
          }
          if (event.key !== "Tab") return;
          const controls = [
            ...(dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled)",
            ) ?? []),
          ];
          const first = controls[0],
            last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <header className={styles.header}>
          <h2 id="link-update-title">
            {results
              ? t("이동했지만 일부 링크를 고치지 못했습니다")
              : t("링크도 함께 고칠까요?")}
          </h2>
          <p>
            <span title={move.from}>{move.from}</span>
            <Icon name="chevron" size={12} />
            <span title={move.to}>{move.to}</span>
          </p>
          {!results ? (
            <p className={styles.summary}>
              {t(
                "'{0}'을(를) 옮기면 Markdown 파일 {1}개의 링크 {2}개가 바뀌어야 합니다.",
                name,
                updates.length,
                updates.reduce((sum, update) => sum + update.count, 0),
              )}
            </p>
          ) : null}
          {request.incomplete && !results ? (
            <p className={styles.notice}>
              <Icon name="warning" size={13} />
              {t("일부 파일은 크기·개수 제한으로 확인하지 못했습니다.")}
            </p>
          ) : null}
        </header>

        {error ? (
          <p className={styles.error} role="alert">
            <Icon name="warning" size={14} />
            {translateError(error)}
          </p>
        ) : null}

        <ScrollArea
          className={styles.filesArea}
          viewportClassName={styles.files}
          aria-label={t("링크가 바뀌는 파일")}
        >
          {(results
            ? updates.filter((update) =>
                failures.some((failure) =>
                  sameDocumentPath(failure.path, update.path),
                ),
              )
            : updates
          ).map((update) => {
            const reason = blocked.get(update.oldPath);
            const failure = failures.find((item) =>
              sameDocumentPath(item.path, update.path),
            );
            return (
              <div
                key={update.oldPath}
                className={styles.file}
                data-shown={update.oldPath === shown}
              >
                {!results ? (
                  <input
                    type="checkbox"
                    aria-label={t("{0} 선택", update.path)}
                    checked={selected.has(update.oldPath)}
                    disabled={working || Boolean(reason)}
                    onChange={(event) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(update.oldPath);
                        else next.delete(update.oldPath);
                        return next;
                      })
                    }
                  />
                ) : null}
                <button
                  type="button"
                  className={styles.fileButton}
                  aria-pressed={update.oldPath === shown}
                  title={update.path}
                  onClick={() => setShown(update.oldPath)}
                >
                  <FileIcon name={update.path} size={15} />
                  <span>
                    <strong>{update.path.split("/").pop()}</strong>
                    <small>
                      {failure?.error
                        ? translateError(failure.error)
                        : (reason ??
                          (update.path.split("/").slice(0, -1).join("/") ||
                            t("프로젝트 루트")))}
                    </small>
                  </span>
                  <span className={styles.count}>{update.count}</span>
                </button>
              </div>
            );
          })}
        </ScrollArea>

        {current ? (
          <div className={styles.diff}>
            <Suspense fallback={null}>
              <ReplacementDiff
                before={current.before}
                after={current.after}
                sideBySide={false}
              />
            </Suspense>
          </div>
        ) : null}

        <div className={dialogStyles.dialogActions}>
          {results ? (
            <button
              className={dialogStyles.primaryButton}
              data-default-action
              onClick={() => finish(true)}
            >
              {t("닫기")}
            </button>
          ) : (
            <>
              <button disabled={working} onClick={() => finish(false)}>
                {t("취소")}
              </button>
              <button disabled={working} onClick={() => void run(false)}>
                {t("이동만")}
              </button>
              <button
                className={dialogStyles.primaryButton}
                data-default-action
                disabled={working || !selected.size}
                onClick={() => void run(true)}
              >
                {t("이동하고 링크 {0}개 고치기", linkCount)}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
