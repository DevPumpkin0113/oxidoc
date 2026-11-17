import { t } from "../settings/i18n";
import { useWorkspace } from "../workspace/store";
import { useDocumentSummaries } from "../workspace/selectors";
import {
  closeDocuments,
  openDocument,
  setSettingsOpen,
} from "../workbench/actions";
import { manageTab } from "../workbench/menus";
import { openPalette } from "../workbench/paletteCommands";
import { useUi } from "../workbench/uiStore";
import { FileIcon } from "./FileIcon";
import Icon from "./Icon";
import Titlebar from "./Titlebar";
import styles from "./TabBar.module.css";

export default function TabBar() {
  const documents = useDocumentSummaries();
  const activeId = useWorkspace((state) => state.activeId);
  const busy = useWorkspace((state) => state.busy);
  const settingsOpen = useUi((state) => state.settingsOpen);
  return (
    <div className={styles.tabBar}>
      <div className={styles.tabs} role="tablist" aria-label={t("열린 문서")}>
        {settingsOpen ? (
          <div className={`${styles.tab} ${styles.activeTab}`}>
            <button
              role="tab"
              aria-selected
              id="settings-tab"
              aria-controls="settings-panel"
            >
              <Icon name="settings" size={15} />
              <span>{t("설정")}</span>
            </button>
            <button
              className={styles.tabClose}
              aria-label={t("설정 탭 닫기")}
              onClick={() => setSettingsOpen(false)}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        ) : null}
        {documents.map((document) => {
          const active = !settingsOpen && activeId === document.id;
          return (
            <div
              className={`${styles.tab} ${active ? styles.activeTab : ""}`}
              key={document.id}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget
                  .querySelector<HTMLElement>('[role="tab"]')
                  ?.focus();
                manageTab(document.id, event.clientX, event.clientY);
              }}
            >
              <button
                role="tab"
                aria-selected={active}
                aria-controls="document-panel"
                id={`tab-${document.id}`}
                onClick={() => openDocument(document.id)}
              >
                <FileIcon name={document.name} size={16} />
                <span>{document.name}</span>
              </button>
              <button
                className={styles.tabClose}
                aria-label={t("{0} 탭 닫기", document.name)}
                onClick={() => {
                  if (!busy) void closeDocuments([document.id]);
                }}
              >
                {document.dirty ? (
                  <span className={styles.tabDirty}>●</span>
                ) : (
                  <Icon name="close" size={13} />
                )}
              </button>
            </div>
          );
        })}
      </div>
      <button
        className={styles.paletteButton}
        title={t("명령 팔레트 (Ctrl Shift P)")}
        aria-label={t("명령 팔레트")}
        onClick={openPalette}
      >
        <Icon name="more" size={15} />
      </button>
      <Titlebar />
    </div>
  );
}
