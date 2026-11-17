import { Suspense } from "react";
import { t } from "../settings/i18n";
import { isMermaidFile } from "../workspace/documentTypes";
import { useWorkspace } from "../workspace/store";
import type { DocumentSummary } from "../workspace/selectors";
import {
  closeOutline,
  followLink,
  navigateTo,
  scroll,
} from "../workbench/actions";
import { manageEditor } from "../workbench/menus";
import { useUi } from "../workbench/uiStore";
import DocumentToolbar from "./DocumentToolbar";
import { DiskNotice } from "./WorkspaceNotices";
import { DocumentEditor, DocumentPreview, OutlineList } from "./DocumentPanes";
import Icon from "./Icon";
import ScrollArea from "./ScrollArea";
import styles from "./DocumentView.module.css";

const clearCommand = () => useUi.setState({ command: undefined });

/** Toolbar, disk-change notice, editor/preview panes and outline of a document. */
export default function DocumentView({
  document,
}: {
  document: DocumentSummary;
}) {
  const id = document.id;
  const projectPath = useWorkspace((state) => state.project?.path);
  const desktop = useWorkspace((state) => state.desktop);
  const view = useWorkspace((state) => state.layout.view);
  const sync = useWorkspace((state) => state.layout.sync);
  const outline = useWorkspace((state) => state.layout.outline);
  const readOnly = useWorkspace(
    (state) =>
      state.busy ||
      state.recoveryCandidates.length > 0 ||
      Boolean(state.recoveryError),
  );
  const command = useUi((state) => state.command);
  const navigation = useUi((state) =>
    state.navigation?.documentId === id ? state.navigation : undefined,
  );
  const syncTarget = useUi((state) =>
    sync && state.scrollTarget?.documentId === id
      ? state.scrollTarget
      : undefined,
  );
  return (
    <>
      <DocumentToolbar document={document} />
      <DiskNotice document={document} />
      <div className={styles.documentBody}>
        <div
          id="document-panel"
          role="tabpanel"
          aria-labelledby={`tab-${id}`}
          className={`${styles.documentArea} ${view === "split" ? styles.splitView : ""}`}
        >
          {view !== "preview" ? (
            <section className={styles.editorPane} aria-label={t("편집 영역")}>
              <div className={styles.paneLabel}>
                <span>{isMermaidFile(id) ? "MERMAID" : "MARKDOWN"}</span>
                <span>{t("편집")}</span>
              </div>
              <div className={styles.editorContent}>
                <Suspense
                  fallback={
                    <div className={styles.loading}>{t("편집기 준비 중…")}</div>
                  }
                >
                  <DocumentEditor
                    onContextMenu={manageEditor}
                    documentId={id}
                    projectPath={projectPath}
                    command={command}
                    onCommandHandled={clearCommand}
                    navigation={navigation}
                    syncTarget={syncTarget}
                    onScrollLine={(line, edge) => scroll("editor", line, edge)}
                    readOnly={readOnly}
                  />
                </Suspense>
              </div>
            </section>
          ) : null}
          {view !== "edit" ? (
            <section
              className={styles.previewPane}
              aria-label={t("미리보기 영역")}
            >
              <div className={styles.paneLabel}>
                <span>PREVIEW</span>
                <span>
                  <i className={styles.liveDot} />
                  {t("실시간 미리보기")}
                </span>
              </div>
              <Suspense
                fallback={
                  <div className={styles.loading}>{t("미리보기 준비 중…")}</div>
                }
              >
                <DocumentPreview
                  key={id}
                  documentPath={id}
                  root={projectPath}
                  desktop={desktop}
                  onNavigate={(target) => void followLink(target)}
                  navigation={navigation}
                  syncTarget={syncTarget}
                  onScrollLine={(line, edge) => scroll("preview", line, edge)}
                />
              </Suspense>
            </section>
          ) : null}
        </div>
        {outline ? (
          <ScrollArea
            as="aside"
            id="document-outline"
            className={styles.outlineBox}
            viewportClassName={styles.outlinePanel}
            aria-label={t("문서 개요")}
          >
            <div className={styles.outlineHeading}>
              <h2>{t("문서 개요")}</h2>
              <button
                type="button"
                aria-label={t("문서 개요 닫기")}
                title={`${t("문서 개요 닫기")} (Esc)`}
                onClick={closeOutline}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <OutlineList
              documentId={id}
              onSelect={(line) => navigateTo(id, line)}
            />
          </ScrollArea>
        ) : null}
      </div>
    </>
  );
}
