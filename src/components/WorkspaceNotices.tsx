import { t, translateError } from "../settings/i18n";
import { useWorkspace } from "../workspace/store";
import type { DocumentSummary } from "../workspace/selectors";
import {
  chooseProject,
  createEntry,
  focusSearch,
  resolveDiskChange,
} from "../workbench/actions";
import { useUi } from "../workbench/uiStore";
import Icon from "./Icon";
import styles from "./WorkspaceNotices.module.css";

export function RecoveryNotice() {
  const busy = useWorkspace((state) => state.busy);
  const count = useWorkspace((state) => state.recoveryCandidates.length);
  const failed = useWorkspace((state) => Boolean(state.recoveryError));
  if (!count && !failed) return null;
  const decide = (restore: boolean) =>
    void useWorkspace.getState().decideRecovery(restore);
  return (
    <div className={styles.externalNotice} role="status">
      <span>
        {failed
          ? t("복구 데이터를 읽지 못했습니다. 기존 임시본은 보존됩니다.")
          : t("복구 가능한 미저장 문서 {0}개", String(count))}
      </span>
      {!failed ? (
        <button disabled={busy} onClick={() => decide(true)}>
          {t("복구")}
        </button>
      ) : null}
      <button disabled={busy} onClick={() => decide(false)}>
        {t("임시본 버리기")}
      </button>
    </div>
  );
}

export function DiskNotice({ document }: { document: DocumentSummary }) {
  const busy = useWorkspace((state) => state.busy);
  if (document.disk === undefined) return null;
  return (
    <div className={styles.externalNotice} role="status">
      <span>
        {t(
          document.disk === null
            ? "파일이 삭제되었거나 읽을 수 없습니다. 편집 내용은 유지됩니다."
            : "파일이 외부에서 변경되었습니다.",
        )}
      </span>
      {document.disk === "changed" ? (
        <>
          <button
            disabled={busy}
            onClick={() => void resolveDiskChange(document.id, true)}
          >
            {t("다시 읽기")}
          </button>
          <button
            disabled={busy}
            title={t("내 편집을 유지하고 다음 저장 시 외부 내용을 덮어씁니다.")}
            onClick={() => void resolveDiskChange(document.id, false)}
          >
            {t("내 편집 유지")}
          </button>
        </>
      ) : (
        <button
          disabled={busy}
          onClick={() => void useWorkspace.getState().saveAs(document.id)}
        >
          {t("다른 이름으로 저장")}
        </button>
      )}
    </div>
  );
}

export function ErrorNotice() {
  const error = useWorkspace((state) => state.error);
  if (!error) return null;
  return (
    <div className={styles.workspaceError} role="alert">
      <span>{translateError(error)}</span>
      <button
        aria-label={t("알림 닫기")}
        onClick={() => useWorkspace.getState().clearError()}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

export function SampleNotice() {
  const desktop = useWorkspace((state) => state.desktop);
  const visible = useUi((state) => state.sampleNotice);
  if (desktop || !visible) return null;
  return (
    <div className={styles.sampleNotice}>
      <Icon name="book" size={14} />
      <span>
        {t(
          "샘플 작업 공간을 둘러보고 있어요. 변경 내용은 이번 실행 동안만 유지됩니다.",
        )}
      </span>
      <button
        aria-label={t("샘플 안내 닫기")}
        onClick={() => useUi.setState({ sampleNotice: false })}
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}

export function EmptyWorkspace() {
  const hasProject = useWorkspace((state) => Boolean(state.project));
  const busy = useWorkspace((state) => state.busy);
  const desktop = useWorkspace((state) => state.desktop);
  return (
    <div className={styles.emptyWorkspace}>
      <span className={styles.emptyMark}>o.</span>
      <h1>{hasProject ? t("열린 문서 없음") : t("생각이 머무는 공간")}</h1>
      <p>
        {hasProject
          ? t("탐색기에서 문서를 선택해 시작하세요.")
          : t("프로젝트 폴더를 열어 시작하세요.")}
      </p>
      <button
        disabled={busy || (!hasProject && !desktop)}
        onClick={() => {
          if (!hasProject) void chooseProject();
          else if (desktop) void createEntry("", false);
          else focusSearch();
        }}
      >
        {hasProject
          ? desktop
            ? t("새 문서")
            : t("문서 검색")
          : t("프로젝트 폴더 열기")}
        <Icon name="chevron" size={14} />
      </button>
      {hasProject ? (
        <span>
          <kbd>Ctrl K</kbd>
          {t("문서 검색")}
        </span>
      ) : null}
    </div>
  );
}
