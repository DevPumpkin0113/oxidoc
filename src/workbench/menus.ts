import type { MenuItem } from "../components/ContextMenu";
import type { EditorContext } from "../components/MarkdownEditor";
import { t } from "../settings/i18n";
import { workspaceApi, type Entry, type Project } from "../workspace/api";
import { scopeMenu, type CommandTarget } from "../workspace/commands";
import { isDirty, isDocumentUnder, useWorkspace } from "../workspace/store";
import { copyText } from "../workspace/textContext";
import { moveWithLinks } from "./linkUpdates";
import {
  activateProject,
  closeDocuments,
  createEntry,
  editorAction,
  revealDocument,
  saveAll,
  searchFolder,
} from "./actions";
import { confirmDocuments, requestAction, showContext } from "./dialogs";
import { buildPaletteCommands } from "./paletteCommands";
import { explorerTree } from "./uiStore";

const workspace = () => useWorkspace.getState();

export function locationActions(root: string, path: string): MenuItem[] {
  return [
    {
      label: t("탐색기에서 열기"),
      icon: "folder",
      run: () => workspaceApi.advanced!.explorer(root, path),
    },
    {
      label: t("경로 복사"),
      icon: "copy",
      run: async () =>
        copyText(await workspaceApi.advanced!.entryPath(root, path)),
    },
    {
      label: t("상대 경로 복사"),
      icon: "copy",
      run: () => copyText(path || "."),
    },
  ];
}

async function pasteInto(parent: string) {
  const state = workspace();
  const clipboard = state.clipboard;
  if (!clipboard || clipboard.root !== state.project?.path) return;
  await state.expand(parent);
  let name: string | undefined;
  if (
    workspace().tree[parent]?.some(
      (entry) =>
        entry.name.toLowerCase() === clipboard.entry.name.toLowerCase(),
    )
  ) {
    const result = await requestAction({
      title: t("다른 이름으로 붙여넣기"),
      body: t("같은 이름의 항목이 이미 있습니다."),
      initial: clipboard.entry.name,
      input: true,
    });
    if (result === null) return;
    name = result;
  }
  if (
    workspace().clipboard !== clipboard ||
    workspace().project?.path !== clipboard.root
  )
    return;
  const perform = () => workspace().pasteEntry(parent, name);
  if (!clipboard.cut) {
    await perform();
    return;
  }
  const to = [parent, name ?? clipboard.entry.name].filter(Boolean).join("/");
  await moveWithLinks({ from: clipboard.entry.path, to }, perform);
}

export function pasteAction(parent: string): MenuItem {
  const state = workspace();
  return {
    id: "entry-paste",
    label: t("붙여넣기"),
    icon: "paste",
    shortcut: "Ctrl+V",
    disabled: !state.clipboard || state.clipboard.root !== state.project?.path,
    run: () => pasteInto(parent),
  };
}

export function entryClipboardActions(entry: Entry): MenuItem[] {
  const parent = entry.isDirectory
    ? entry.path
    : entry.path.split("/").slice(0, -1).join("/");
  return [
    {
      id: "entry-cut",
      label: t("잘라내기"),
      shortcut: "Ctrl+X",
      run: () => workspace().copyEntry(entry, true),
    },
    {
      id: "entry-copy",
      label: t("복사"),
      icon: "copy",
      shortcut: "Ctrl+C",
      run: () => workspace().copyEntry(entry, false),
    },
    pasteAction(parent),
    { type: "separator", id: "entry-clipboard" },
  ];
}

export function manageTab(id: string, x: number, y: number) {
  const state = workspace();
  const document = state.documents.find((document) => document.id === id);
  const project = state.project;
  if (!document || !project) return;
  const ids = state.documents.map((document) => document.id);
  const index = ids.indexOf(id);
  const items: MenuItem[] = [
    { label: t("닫기"), run: () => closeDocuments([id]) },
    {
      label: t("다른 탭 닫기"),
      disabled: ids.length < 2,
      run: () => closeDocuments(ids.filter((other) => other !== id)),
    },
    {
      label: t("오른쪽 탭 닫기"),
      disabled: index === ids.length - 1,
      run: () => closeDocuments(ids.slice(index + 1)),
    },
    { label: t("모든 탭 닫기"), run: () => closeDocuments(ids) },
    { type: "separator", id: "tab-save" },
    {
      label: t("모두 저장"),
      icon: "save",
      requiresDesktop: true,
      disabled: !state.documents.some(isDirty),
      run: saveAll,
    },
    { type: "separator", id: "tab-path" },
    { label: t("탐색기에서 위치 표시"), run: () => revealDocument(id) },
    ...locationActions(project.path, id).map((item) =>
      item.type === "separator" ? item : { ...item, requiresDesktop: true },
    ),
  ];
  const target: CommandTarget = { kind: "document", root: project.path, id };
  showContext(
    document.name,
    items.map((item) =>
      item.type === "separator" ? item : { ...item, target },
    ),
    x,
    y,
  );
}

export function manageExplorer(x: number, y: number) {
  const current = workspace().project;
  if (!current) {
    showContext(
      t("탐색기"),
      buildPaletteCommands().filter((command) =>
        ["open", "settings"].includes(command.id),
      ),
      x,
      y,
    );
    return;
  }
  const items: MenuItem[] = [
    { label: t("새 문서"), icon: "add", run: () => createEntry("", false) },
    { label: t("새 폴더"), icon: "folder", run: () => createEntry("", true) },
    pasteAction(""),
    { type: "separator", id: "root-paths" },
    ...locationActions(current.path, ""),
    { type: "separator", id: "root-view" },
    {
      label: t("새로고침"),
      icon: "refresh",
      run: () => workspace().refresh(),
    },
    {
      label: t("모두 접기"),
      icon: "collapse",
      run: () => {
        explorerTree.current?.querySelectorAll("details").forEach((details) => {
          details.open = false;
        });
      },
    },
  ];
  const origin = explorerTree.current?.querySelector<HTMLElement>("summary");
  origin?.focus();
  showContext(
    current.name,
    scopeMenu(items, { kind: "project", path: current.path }),
    x,
    y,
    origin ?? undefined,
  );
}

export function manageEditor(context: EditorContext) {
  const state = workspace();
  if (!state.project || !state.activeId) return;
  const target: CommandTarget = {
    kind: "document",
    root: state.project.path,
    id: state.activeId,
    active: true,
  };
  const items: MenuItem[] = [
    {
      label: t("잘라내기"),
      disabled: !context.hasSelection || context.readOnly,
      run: () => editorAction("cut"),
    },
    {
      label: t("복사"),
      icon: "copy",
      disabled: !context.hasSelection,
      allowBusy: true,
      run: () => editorAction("copy"),
    },
    {
      label: t("붙여넣기"),
      icon: "paste",
      disabled: context.readOnly,
      run: () => editorAction("paste"),
    },
    { type: "separator", id: "editor-select" },
    {
      label: t("모두 선택"),
      allowBusy: true,
      run: () => editorAction("selectAll"),
    },
    {
      label: t("문서 내 찾기"),
      icon: "search",
      run: () => editorAction("find"),
    },
    { label: t("문서 내 바꾸기"), run: () => editorAction("replace") },
  ];
  showContext(
    t("Markdown 편집기"),
    items.map((item) =>
      item.type === "separator" ? item : { ...item, target },
    ),
    context.x,
    context.y,
  );
}

export function entryMenuItems(entry: Entry): MenuItem[] {
  const root = workspace().project?.path;
  if (!root) return [];
  const items: MenuItem[] = entryClipboardActions(entry);
  items.push(...locationActions(root, entry.path), {
    type: "separator",
    id: "entry-location",
  });
  if (entry.isDirectory) {
    items.push(
      {
        label: t("새 문서"),
        icon: "add",
        run: () => createEntry(entry.path, false),
      },
      {
        label: t("새 폴더"),
        icon: "folder",
        run: () => createEntry(entry.path, true),
      },
      { type: "separator", id: "entry-create" },
      {
        label: t("이 폴더에서 검색"),
        icon: "search",
        run: () => searchFolder(entry.path),
      },
      { type: "separator", id: "entry-search" },
    );
  }
  items.push(
    {
      id: "entry-rename",
      label: t("이름 변경"),
      icon: "rename",
      shortcut: "F2",
      run: async () => {
        const name = await requestAction({
          title: t("이름 변경"),
          initial: entry.name,
          input: true,
        });
        if (name === null || workspace().project?.path !== root) return;
        const parent = entry.path.split("/").slice(0, -1);
        await moveWithLinks(
          { from: entry.path, to: [...parent, name].join("/") },
          () => workspace().renameEntry(entry.path, name),
        );
      },
    },
    { type: "separator", id: "entry-trash" },
    {
      id: "entry-delete",
      label: t("휴지통으로 이동"),
      icon: "trash",
      danger: true,
      shortcut: "Delete",
      run: async () => {
        const affected = workspace().documents.filter((document) =>
          isDocumentUnder(document.id, entry.path),
        );
        if (!(await confirmDocuments(affected))) return;
        const confirm = await requestAction({
          title: t("휴지통으로 이동할까요?"),
          body: t(
            "{0}{1}",
            entry.path,
            entry.isDirectory ? t(" · 하위 항목 포함") : "",
          ),
          label: t("휴지통으로 이동"),
        });
        if (confirm && workspace().project?.path === root)
          await workspace().trashEntry(entry.path);
      },
    },
  );
  return scopeMenu(items, { kind: "entry", root, path: entry.path });
}

export function manageEntry(entry: Entry, x: number, y: number) {
  showContext(entry.name, entryMenuItems(entry), x, y);
}

export function manageProject(item: Project, x: number, y: number) {
  const isOpen = () => workspace().project?.path === item.path;
  showContext(
    item.name,
    scopeMenu(
      [
        {
          label: t("프로젝트 열기"),
          icon: "projects",
          run: () => activateProject(item),
        },
        {
          label: t(item.favorite ? "즐겨찾기에서 제거" : "즐겨찾기에 추가"),
          icon: "star",
          checked: Boolean(item.favorite),
          run: () => {
            const latest = workspace().projects.find(
              (project) => project.path === item.path,
            );
            if (latest)
              return workspace().updateProject(item.path, {
                favorite: !latest.favorite,
              });
          },
        },
        { type: "separator", id: "project-location" },
        ...locationActions(item.path, "").slice(0, 2),
        { type: "separator", id: "project-details" },
        {
          label: t("표시 이름 변경"),
          icon: "rename",
          run: async () => {
            const name = await requestAction({
              title: t("프로젝트 이름 변경"),
              initial: item.name,
              input: true,
            });
            if (name !== null)
              await workspace().updateProject(item.path, { name });
          },
        },
        {
          label: t("태그 편집"),
          icon: "tag",
          run: async () => {
            const tags = await requestAction({
              title: t("프로젝트 태그"),
              body: t("쉼표로 구분해 입력하세요. 비우면 태그가 제거됩니다."),
              initial: item.tags?.join(", ") ?? "",
              input: true,
              allowEmpty: true,
            });
            if (tags !== null)
              await workspace().updateProject(item.path, {
                tags: tags
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              });
          },
        },
        {
          label: t("폴더 경로 다시 연결"),
          icon: "folder",
          run: async () => {
            if (isOpen() && !(await confirmDocuments(workspace().documents)))
              return;
            await workspace().relocateProject(item.path);
          },
        },
        { type: "separator", id: "project-remove" },
        {
          label: t("목록에서 제거"),
          icon: "close",
          danger: true,
          run: async () => {
            if (isOpen() && !(await confirmDocuments(workspace().documents)))
              return;
            const confirm = await requestAction({
              title: t("프로젝트를 목록에서 제거할까요?"),
              body: t("{0} · 실제 폴더와 파일은 유지됩니다.", item.name),
              label: t("목록에서 제거"),
            });
            if (confirm) await workspace().removeProject(item.path);
          },
        },
      ],
      { kind: "project", path: item.path },
    ),
    x,
    y,
  );
}
