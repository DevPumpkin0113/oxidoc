import { useEffect } from "react";
import { t } from "../settings/i18n";
import {
  isDocumentUnder,
  isExternal,
  sameDocumentPath,
  useWorkspace,
  type Layout,
} from "../workspace/store";
import {
  activateProject,
  chooseProject,
  jump,
  setActivity,
  setSettingsOpen,
} from "../workbench/actions";
import { manageEntry, manageExplorer, manageProject } from "../workbench/menus";
import { runAppCommand } from "../workbench/paletteCommands";
import { explorerTree, searchInput, useUi } from "../workbench/uiStore";
import Icon, { type IconName } from "./Icon";
import ProjectManager from "./ProjectManager";
import ProjectSearch from "./ProjectSearch";
import ScrollArea from "./ScrollArea";
import TreeDropTarget from "./TreeDropTarget";
import WorkspaceTree from "./WorkspaceTree";
import styles from "./Sidebar.module.css";
import panelStyles from "./panel.module.css";
import treeStyles from "./tree.module.css";

/** Expands, focuses and scrolls to the row requested by revealDocument. */
function useRevealTarget() {
  const revealTarget = useUi((state) => state.revealTarget);
  useEffect(() => {
    const tree = explorerTree.current;
    if (!revealTarget || !tree) return;
    const folder = useWorkspace
      .getState()
      .documents.find((document) =>
        sameDocumentPath(document.id, revealTarget),
      )?.folder;
    tree.open = true;
    for (const row of tree.querySelectorAll<HTMLElement>("[data-tree-path]")) {
      const path = row.dataset.treePath;
      if (
        !path ||
        !(
          isDocumentUnder(revealTarget, path) ||
          (folder && isDocumentUnder(folder, path))
        )
      )
        continue;
      if (
        row.matches("summary") &&
        row.parentElement instanceof HTMLDetailsElement
      )
        row.parentElement.open = true;
      if (sameDocumentPath(path, revealTarget)) {
        const target =
          row.tagName === "SUMMARY"
            ? row
            : row.querySelector<HTMLElement>("button");
        target?.focus();
        target?.scrollIntoView?.({ block: "nearest" });
      }
    }
    useUi.setState({ revealTarget: null });
  }, [revealTarget]);
}

function ExplorerToolbar() {
  const explorerView = useWorkspace((state) => state.layout.explorerView);
  const setExplorerView = (view: Layout["explorerView"]) =>
    useWorkspace.getState().setLayout({ explorerView: view });
  return (
    <div
      className={styles.fileViewToolbar}
      role="group"
      aria-label={t("파일 보기")}
    >
      <button
        aria-label={t("기본 보기")}
        aria-pressed={explorerView === "documents"}
        title={`${t("기본 보기")} · ${t(
          "Markdown·Mermaid 문서와 문서가 있는 폴더만 표시",
        )}`}
        onClick={() => setExplorerView("documents")}
      >
        <Icon name="document" size={15} />
      </button>
      <button
        aria-label={t("전체 보기")}
        aria-pressed={explorerView === "all"}
        title={`${t("전체 보기")} · ${t("모든 파일과 폴더 표시")}`}
        onClick={() => setExplorerView("all")}
      >
        <Icon name="files" size={15} />
      </button>
    </div>
  );
}

function ExplorerPanel() {
  const project = useWorkspace((state) => state.project);
  const desktop = useWorkspace((state) => state.desktop);
  const busy = useWorkspace((state) => state.busy);
  const rootEmpty = useWorkspace((state) => state.tree[""]?.length === 0);
  useRevealTarget();
  const external = isExternal(project);
  const ExplorerRoot = rootEmpty ? "div" : "details";
  const folderName =
    project?.path === "sample"
      ? project.name
      : (project?.path.split(/[\\/]/).filter(Boolean).pop() ?? project?.name);
  return (
    <>
      <div className={styles.projectLabel}>
        <div className={styles.projectName}>
          <strong title={project?.name}>
            {project?.name ?? t("프로젝트 없음")}
          </strong>
          {!desktop ? <span>{t("브라우저 샘플")}</span> : null}
        </div>
        {project && !external ? <ExplorerToolbar /> : null}
      </div>
      {!project ? (
        <>
          <div className={styles.projectActions}>
            <button
              className={panelStyles.openProjectButton}
              disabled={busy || !desktop}
              onClick={() => void chooseProject()}
            >
              <Icon name="folder" size={15} />
              {t("폴더 열기")}
              <span>Ctrl O</span>
            </button>
          </div>
          <p className={panelStyles.projectNote} style={{ padding: "0 16px" }}>
            {t("프로젝트 폴더를 열어 문서를 편집하세요.")}
          </p>
        </>
      ) : (
        <ExplorerRoot
          ref={(node: HTMLElement | null) => {
            explorerTree.current =
              node instanceof HTMLDetailsElement ? node : null;
          }}
          className={treeStyles.treeRoot}
          open={rootEmpty ? undefined : true}
          key={project.path}
        >
          <TreeDropTarget
            as={rootEmpty ? "div" : "summary"}
            className={rootEmpty ? treeStyles.emptyRoot : undefined}
            tabIndex={rootEmpty ? 0 : undefined}
            folderPath=""
            data-tree-path=""
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              manageExplorer(event.clientX, event.clientY);
            }}
          >
            {rootEmpty ? (
              <span className={treeStyles.chevronSpace} aria-hidden="true" />
            ) : (
              <Icon name="down" size={12} />
            )}
            {external ? (
              <span>{t("열린 파일")}</span>
            ) : (
              <span title={project.path}>{folderName}</span>
            )}
            {desktop ? (
              <span
                className={styles.explorerTools}
                onClick={(event) => event.stopPropagation()}
              >
                {external ? null : (
                  <>
                    <button
                      title={t("새 문서")}
                      aria-label={t("새 문서")}
                      disabled={busy}
                      onClick={() => runAppCommand("new-file")}
                    >
                      <Icon name="add" size={14} />
                    </button>
                    <button
                      title={t("새 폴더")}
                      aria-label={t("새 폴더")}
                      disabled={busy}
                      onClick={() => runAppCommand("new-folder")}
                    >
                      <Icon name="folder" size={14} />
                    </button>
                  </>
                )}
                <button
                  title={t("새로고침")}
                  aria-label={t("새로고침")}
                  disabled={busy}
                  onClick={() => void useWorkspace.getState().refresh()}
                >
                  <Icon name="refresh" size={14} />
                </button>
              </span>
            ) : null}
          </TreeDropTarget>
          <WorkspaceTree
            onManage={manageEntry}
            onOpen={() => setSettingsOpen(false)}
          />
        </ExplorerRoot>
      )}
    </>
  );
}

function SearchPanel() {
  const root = useWorkspace((state) => state.project?.path);
  const external = useWorkspace((state) => isExternal(state.project));
  const scope = useUi((state) => state.searchScope);
  if (external)
    return (
      <p className={panelStyles.projectNote} style={{ padding: "0 16px" }}>
        {t(
          "External에서는 프로젝트 검색을 쓸 수 없습니다. 폴더를 프로젝트로 등록하면 쓸 수 있습니다.",
        )}
      </p>
    );
  return (
    <ProjectSearch
      onReplace={() => useUi.setState({ replaceOpen: true })}
      folder={scope?.root === root ? scope?.path : ""}
      onClearFolder={() => useUi.setState({ searchScope: null })}
      inputRef={searchInput}
      onResult={(match) => void jump(match)}
    />
  );
}

export default function Sidebar() {
  const activity = useWorkspace((state) => state.layout.activity);
  const activities: {
    id: Layout["activity"];
    label: string;
    icon: IconName;
  }[] = [
    { id: "files", label: t("탐색기"), icon: "files" },
    { id: "search", label: t("검색"), icon: "search" },
    { id: "projects", label: t("프로젝트"), icon: "projects" },
  ];
  const label = activities.find((item) => item.id === activity)?.label;
  return (
    <aside
      className={styles.sidebar}
      data-explorer={activity === "files" ? "true" : undefined}
      aria-label={label}
    >
      <nav
        className={styles.activityBar}
        aria-label={t("작업 영역")}
        data-tauri-drag-region
      >
        {activities.map((item) => (
          <button
            key={item.id}
            aria-label={item.label}
            title={item.label}
            aria-pressed={activity === item.id}
            className={`${styles.activity} ${activity === item.id ? styles.activeActivity : ""}`}
            onClick={() => setActivity(item.id)}
          >
            <Icon name={item.icon} size={19} />
          </button>
        ))}
      </nav>
      <div className={styles.sidebarHeading}>
        <span>{activity === "projects" ? t("프로젝트 목록") : label}</span>
      </div>
      {/* Activity bar and heading stay put; only the panel scrolls. */}
      <ScrollArea className={styles.panelArea}>
        {activity === "files" ? <ExplorerPanel /> : null}
        {activity === "search" ? <SearchPanel /> : null}
        {activity === "projects" ? (
          <ProjectManager
            onActivate={(item) => void activateProject(item)}
            onRegister={() => void chooseProject()}
            onManage={manageProject}
          />
        ) : null}
      </ScrollArea>
    </aside>
  );
}
