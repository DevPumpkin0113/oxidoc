import { t } from "../settings/i18n";
import { useUpdater } from "../settings/updater";
import { isImageFile, isMermaidFile } from "../workspace/documentTypes";
import { useWorkspace } from "../workspace/store";
import {
  useDocumentSummaries,
  type DocumentSummary,
} from "../workspace/selectors";
import { setSettingsOpen, setSidebar } from "../workbench/actions";
import { useUi } from "../workbench/uiStore";
import { CursorStatus, TextStatus } from "./DocumentPanes";
import Icon from "./Icon";
import ProjectDock from "./ProjectDock";
import styles from "./StatusBar.module.css";

const UPDATE_NOTICE_PHASES = ["available", "downloading", "ready", "error"];

type SaveState = "saved" | "unsaved" | "changed" | "missing";
const SAVE_STATE_LABELS: Record<SaveState, string> = {
  saved: "저장됨",
  unsaved: "저장 안 됨",
  changed: "외부에서 변경됨",
  missing: "파일 없음",
};
function saveState(document: DocumentSummary): SaveState {
  if (document.disk === null) return "missing";
  if (document.disk === "changed") return "changed";
  return document.dirty ? "unsaved" : "saved";
}

export default function StatusBar() {
  const sidebar = useWorkspace((state) => state.layout.sidebar);
  const projectName = useWorkspace((state) => state.project?.name);
  const desktop = useWorkspace((state) => state.desktop);
  const busy = useWorkspace((state) => state.busy);
  const activeId = useWorkspace((state) => state.activeId);
  const documents = useDocumentSummaries();
  const anyDirty = documents.some((document) => document.dirty);
  const active = documents.find((document) => document.id === activeId);
  const settingsOpen = useUi((state) => state.settingsOpen);
  const updatePhase = useUpdater((state) => state.phase);
  const updateVersion = useUpdater((state) => state.version);
  const updateNotice =
    !!updateVersion && UPDATE_NOTICE_PHASES.includes(updatePhase);
  const sidebarLabel = sidebar ? t("사이드바 닫기") : t("사이드바 열기");
  return (
    <footer className={styles.statusbar}>
      <div className={styles.statusLeft}>
        <button
          className={styles.sidebarToggle}
          aria-label={t("설정")}
          aria-pressed={settingsOpen}
          title={
            updateNotice
              ? t("설정 (Ctrl ,) · 업데이트 {0}", updateVersion!)
              : t("설정 (Ctrl ,)")
          }
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          <Icon name="settings" size={14} />
          {updateNotice ? (
            <span className={styles.updateDot} aria-hidden="true" />
          ) : null}
        </button>
        <button
          className={styles.sidebarToggle}
          aria-label={sidebarLabel}
          aria-expanded={sidebar}
          title={`${sidebarLabel} (Ctrl B)`}
          onClick={() => setSidebar((value) => !value)}
        >
          <Icon name="panel" size={14} />
        </button>
        {desktop ? (
          <ProjectDock />
        ) : (
          <span className={styles.statusProject}>
            <Icon name="projects" size={13} />
            {projectName ?? t("프로젝트 없음")}
          </span>
        )}
        {busy || anyDirty ? (
          <span className={styles.statusMessage}>
            <Icon name="check" size={12} />
            {busy ? t("처리 중…") : t("저장하지 않은 변경 있음")}
          </span>
        ) : null}
      </div>
      <div className={styles.statusRight}>
        {updateNotice ? (
          <button
            onClick={() => setSettingsOpen(true)}
            title={t("업데이트 설정 열기")}
          >
            {t("업데이트 {0}", updateVersion)}
          </button>
        ) : null}
        {active && isImageFile(active.id) ? (
          <span>
            <Icon name="preview" size={13} />
            {t("이미지 · 읽기 전용")}
          </span>
        ) : active ? (
          <>
            <span className={styles.saveState} data-state={saveState(active)}>
              {t(SAVE_STATE_LABELS[saveState(active)])}
            </span>
            <TextStatus documentId={active.id} />
            <CursorStatus />
            <span className={styles.optionalStatus}>UTF-8</span>
            <span className={styles.optionalStatus}>{t("공백: 2")}</span>
            <span>
              <Icon name="markdown" size={13} />
              {isMermaidFile(active.id) ? "Mermaid" : "Markdown"}
            </span>
          </>
        ) : (
          <span>{t("열린 문서 없음")}</span>
        )}
      </div>
    </footer>
  );
}
