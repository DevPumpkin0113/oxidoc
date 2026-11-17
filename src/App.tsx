import DocumentView from "./components/DocumentView";
import SettingsPanel from "./components/SettingsPanel";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import TabBar from "./components/TabBar";
import WorkbenchOverlays from "./components/WorkbenchOverlays";
import {
  EmptyWorkspace,
  ErrorNotice,
  RecoveryNotice,
  SampleNotice,
} from "./components/WorkspaceNotices";
import { useDocumentSummaries } from "./workspace/selectors";
import { useWorkspace } from "./workspace/store";
import { installUpdate } from "./workbench/actions";
import { useAppearance, useWorkbench } from "./workbench/hooks";
import { isModalOpen, useUi } from "./workbench/uiStore";
import styles from "./App.module.css";

function ContentPanel() {
  const busy = useWorkspace((state) => state.busy);
  const activeId = useWorkspace((state) => state.activeId);
  const settingsOpen = useUi((state) => state.settingsOpen);
  const activeDocument = useDocumentSummaries().find(
    (document) => document.id === activeId,
  );
  return (
    <div className={styles.contentPanel} aria-busy={busy}>
      <RecoveryNotice />
      <ErrorNotice />
      {settingsOpen ? (
        <div
          id="settings-panel"
          role="tabpanel"
          aria-labelledby="settings-tab"
          className={styles.settingsContainer}
        >
          <SettingsPanel onInstallUpdate={installUpdate} />
        </div>
      ) : activeDocument ? (
        <DocumentView document={activeDocument} />
      ) : (
        <EmptyWorkspace />
      )}
      <SampleNotice />
    </div>
  );
}

export default function App() {
  useAppearance();
  useWorkbench();
  const sidebar = useWorkspace((state) => state.layout.sidebar);
  const modal = useUi(isModalOpen);
  return (
    <>
      <div className={styles.app} inert={modal}>
        <div
          className={`${styles.workbench} ${!sidebar ? styles.sidebarHidden : ""}`}
          data-tauri-drag-region
        >
          {sidebar ? <Sidebar /> : null}
          <main className={styles.main}>
            <TabBar />
            <ContentPanel />
          </main>
        </div>
        <StatusBar />
      </div>
      <WorkbenchOverlays />
    </>
  );
}
