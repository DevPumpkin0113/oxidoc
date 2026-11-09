import { create } from "zustand";
import { sampleDocuments } from "../data/sampleDocuments";
import {
  workspaceApi,
  type WorkspaceApi,
  type Project,
  type Entry,
  type ProjectPatch,
} from "./api";
export interface Document {
  id: string;
  name: string;
  folder: string;
  content: string;
  savedContent: string;
}
export interface Layout {
  sidebar: boolean;
  activity: "files" | "search" | "projects";
  view: "edit" | "split" | "preview";
  outline: boolean;
  sync: boolean;
}
export const defaultLayout: Layout = {
  sidebar: true,
  activity: "files",
  view: "split",
  outline: false,
  sync: true,
};
interface Session {
  paths: string[];
  activeId: string | null;
  layout: Layout;
}
interface State {
  initialized: boolean;
  desktop: boolean;
  busy: boolean;
  error: string;
  generation: number;
  projects: Project[];
  project: Project | null;
  tree: Record<string, Entry[]>;
  documents: Document[];
  activeId: string | null;
  layout: Layout;
  sessions: Record<string, Session>;
  initialize: (desktop: boolean) => Promise<void>;
  choose: () => Promise<Project | null>;
  activate: (project: Project) => Promise<boolean>;
  expand: (path: string) => Promise<void>;
  open: (entry: Entry) => Promise<void>;
  edit: (id: string, content: string) => void;
  save: (id: string) => Promise<boolean>;
  saveAs: (id: string) => Promise<boolean>;
  close: (id: string) => void;
  clearError: () => void;
  setLayout: (patch: Partial<Layout>) => void;
  persist: () => Promise<void>;
  refresh: () => Promise<void>;
  createEntry: (
    parent: string,
    name: string,
    directory: boolean,
  ) => Promise<void>;
  renameEntry: (path: string, name: string) => Promise<void>;
  moveFile: (path: string, parent: string) => Promise<boolean>;
  trashEntry: (path: string) => Promise<void>;
  updateProject: (path: string, patch: ProjectPatch) => Promise<void>;
  removeProject: (path: string) => Promise<void>;
  relocateProject: (path: string) => Promise<void>;
}
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function parseLayout(value: unknown): Layout {
  const data = record(value);
  return {
    sidebar: typeof data.sidebar === "boolean" ? data.sidebar : true,
    activity: ["files", "search", "projects"].includes(String(data.activity))
      ? (data.activity as Layout["activity"])
      : "files",
    view: ["edit", "split", "preview"].includes(String(data.view))
      ? (data.view as Layout["view"])
      : "split",
    outline: data.outline === true,
    sync: data.sync !== false,
  };
}
function parseSession(value: unknown, layout: Layout): Session {
  const data = record(value);
  return {
    paths: Array.isArray(data.paths)
      ? data.paths
          .filter(
            (path): path is string =>
              typeof path === "string" && path.length < 4096,
          )
          .filter(
            (path, index, all) =>
              all.findIndex((candidate) =>
                sameDocumentPath(candidate, path),
              ) === index,
          )
          .slice(0, 100)
      : [],
    activeId: typeof data.activeId === "string" ? data.activeId : null,
    layout: data.layout ? parseLayout(data.layout) : layout,
  };
}
export const isDirty = (document: Document) =>
  document.content !== document.savedContent;
// Windows is the supported desktop target; use the same identity for links,
// explorer paths, save targets and descendant operations.
const pathKey = (path: string) => path.replace(/\\/g, "/").toLowerCase();
export const sameDocumentPath = (a: string, b: string) =>
  pathKey(a) === pathKey(b);
export const isDocumentUnder = (id: string, path: string) =>
  sameDocumentPath(id, path) || pathKey(id).startsWith(pathKey(path) + "/");
const under = isDocumentUnder;
const documentFrom = (path: string, content: string): Document => ({
  id: path,
  name: path.split("/").pop() ?? path,
  folder: path.split("/").slice(0, -1).join("/"),
  content,
  savedContent: content,
});
export function createWorkspaceStore(api: WorkspaceApi = workspaceApi) {
  let persistQueue: Promise<void> = Promise.resolve();
  const store = create<State>((set, get) => ({
    initialized: false,
    desktop: false,
    busy: false,
    error: "",
    generation: 0,
    projects: [],
    project: null,
    tree: {},
    documents: [],
    activeId: null,
    layout: { ...defaultLayout },
    sessions: {},
    initialize: async (desktop) => {
      if (get().initialized) return;
      set({ initialized: true, desktop, busy: desktop, error: "" });
      if (!desktop) {
        const documents = sampleDocuments.map((document) => ({
          ...document,
          savedContent: document.content,
        }));
        const tree: Record<string, Entry[]> = {
          "": [
            { name: "README.md", path: "readme", isDirectory: false },
            { name: "가이드", path: "가이드", isDirectory: true },
            { name: "노트", path: "노트", isDirectory: true },
          ],
        };
        for (const folder of ["가이드", "노트"])
          tree[folder] = documents
            .filter((document) => document.folder === folder)
            .map((document) => ({
              name: document.name,
              path: document.id,
              isDirectory: false,
            }));
        set({
          projects: [{ name: "샘플 작업 공간", path: "sample" }],
          project: { name: "샘플 작업 공간", path: "sample" },
          tree,
          documents: documents.slice(0, 2),
          activeId: "readme",
        });
        return;
      }
      try {
        const projects = await api.projects();
        set({ projects });
        // A retry may happen after the user has already opened and edited a project.
        // Refresh its metadata without replaying startup/session restoration.
        const activeProject = get().project;
        if (activeProject) {
          set({
            project:
              projects.find((project) => project.path === activeProject.path) ??
              activeProject,
          });
          return;
        }
        if (api.advanced) {
          const saved = record(await api.advanced.loadApp());
          set({ layout: parseLayout(saved.layout) });
          const project = projects.find(
            (project) => project.path === saved.lastProject,
          );
          set({ busy: false });
          if (project) {
            if (project.status && project.status !== "available")
              set({
                error:
                  "이전 프로젝트에 접근할 수 없습니다. 프로젝트에서 경로를 다시 연결해 주세요.",
                layout: { ...get().layout, activity: "projects" },
              });
            else await get().activate(project);
          }
        }
      } catch (error) {
        set({ error: String(error), initialized: false });
      } finally {
        set({ busy: false });
      }
    },
    choose: async () => {
      if (get().busy || !get().desktop) return null;
      set({ busy: true, error: "" });
      try {
        const project = await api.pick();
        set({ projects: await api.projects() });
        return project;
      } catch (error) {
        set({ error: String(error) });
        return null;
      } finally {
        set({ busy: false });
      }
    },
    activate: async (project) => {
      if (get().busy) return false;
      if (!get().desktop) return true;
      set({ busy: true, error: "" });
      try {
        await get().persist();
        const entries = await api.entries(project.path, "");
        const saved =
          get().sessions[project.path] ??
          parseSession(
            api.advanced ? await api.advanced.loadSession(project.path) : {},
            { ...get().layout, activity: "files" },
          );
        const restored: Document[] = [];
        const missing: string[] = [];
        for (const path of saved.paths) {
          try {
            restored.push(
              documentFrom(path, await api.read(project.path, path)),
            );
          } catch {
            missing.push(path);
          }
        }
        set((state) => ({
          project,
          tree: { "": entries },
          documents: restored,
          activeId:
            restored.find(
              (document) =>
                saved.activeId && sameDocumentPath(document.id, saved.activeId),
            )?.id ??
            restored[0]?.id ??
            null,
          layout: saved.layout,
          generation: state.generation + 1,
          error: missing.length
            ? `복원하지 못한 문서: ${missing.join(", ")}`
            : "",
        }));
        if (api.advanced)
          try {
            const projects = await api.advanced.update(project.path, {
              touch: true,
            });
            set({
              projects,
              project:
                projects.find((item) => item.path === project.path) ?? project,
            });
          } catch (error) {
            set({ error: `최근 사용 정보 저장 실패: ${String(error)}` });
          }
        return true;
      } catch (error) {
        set({ error: String(error) });
        return false;
      } finally {
        set({ busy: false });
      }
    },
    expand: async (path) => {
      const { project, tree, desktop, generation } = get();
      if (!desktop || !project || tree[path]) return;
      try {
        const entries = await api.entries(project.path, path);
        if (get().generation === generation)
          set((state) => ({ tree: { ...state.tree, [path]: entries } }));
      } catch (error) {
        if (get().generation === generation) set({ error: String(error) });
      }
    },
    open: async (entry) => {
      const { project, documents, desktop } = get();
      if (get().busy || !project || entry.isDirectory) return;
      const existing = documents.find((document) =>
        sameDocumentPath(document.id, entry.path),
      );
      if (existing) {
        set({ activeId: existing.id });
        return;
      }
      set({ busy: true, error: "" });
      try {
        const sample = sampleDocuments.find(
          (document) => document.id === entry.path,
        );
        const content = desktop
          ? await api.read(project.path, entry.path)
          : (sample?.content ?? "");
        set((state) => ({
          documents: [
            ...state.documents,
            {
              ...documentFrom(entry.path, content),
              name: entry.name,
              folder: desktop
                ? entry.path.split("/").slice(0, -1).join("/")
                : (sample?.folder ?? ""),
            },
          ],
          activeId: entry.path,
        }));
      } catch (error) {
        set({ error: String(error) });
      } finally {
        set({ busy: false });
      }
    },
    edit: (id, content) =>
      set((state) => ({
        documents: state.documents.map((document) =>
          document.id === id ? { ...document, content } : document,
        ),
      })),
    save: async (id) => {
      const { project, documents, desktop, busy } = get();
      const document = documents.find((document) => document.id === id);
      if (!project || !document || busy) return false;
      if (!isDirty(document)) return true;
      if (!desktop) {
        set({ error: "브라우저 샘플에서는 디스크에 저장할 수 없습니다." });
        return false;
      }
      set({ busy: true, error: "" });
      try {
        await api.save(
          project.path,
          id,
          document.content,
          document.savedContent,
        );
        set((state) => ({
          documents: state.documents.map((item) =>
            item.id === id ? { ...item, savedContent: document.content } : item,
          ),
        }));
        return true;
      } catch (error) {
        set({ error: String(error) });
        return false;
      } finally {
        set({ busy: false });
      }
    },
    saveAs: async (id) => {
      const { project, documents, desktop, busy } = get();
      const document = documents.find((document) => document.id === id);
      if (!project || !document || busy || !desktop || !api.advanced)
        return false;
      set({ busy: true, error: "" });
      try {
        const path = await api.advanced.pickSave(project.path, id);
        if (!path) return false;
        if (sameDocumentPath(path, id)) {
          set({ busy: false });
          return await get().save(id);
        }
        if (
          get().documents.some(
            (item) => sameDocumentPath(item.id, path) && isDirty(item),
          )
        )
          throw new Error(
            "대상 문서에 미저장 변경이 있습니다. 먼저 저장하거나 닫아 주세요.",
          );
        const expected = await api.advanced.target(project.path, path);
        await api.advanced.saveAs(
          project.path,
          path,
          document.content,
          expected,
        );
        set((state) => ({
          documents: state.documents
            .filter((item) => !sameDocumentPath(item.id, path))
            .map((item) =>
              item.id === id
                ? {
                    ...documentFrom(path, document.content),
                    content: item.content,
                  }
                : item,
            ),
          activeId: state.activeId === id ? path : state.activeId,
        }));
        await get().refresh();
        return true;
      } catch (error) {
        set({ error: String(error) });
        return false;
      } finally {
        set({ busy: false });
      }
    },
    close: (id) =>
      set((state) => {
        const index = state.documents.findIndex(
          (document) => document.id === id,
        );
        const documents = state.documents.filter(
          (document) => document.id !== id,
        );
        return {
          documents,
          activeId:
            state.activeId === id
              ? (documents[Math.max(0, index - 1)]?.id ?? null)
              : state.activeId,
        };
      }),
    clearError: () => set({ error: "" }),
    setLayout: (patch) =>
      set((state) => ({ layout: { ...state.layout, ...patch } })),
    persist: async () => {
      const state = get();
      if (
        !state.desktop ||
        !state.project ||
        !api.advanced ||
        !state.projects.some((project) => project.path === state.project?.path)
      )
        return;
      const root = state.project.path;
      const session: Session = {
        paths: state.documents.map((document) => document.id),
        activeId: state.activeId,
        layout: { ...state.layout },
      };
      set((state) => ({ sessions: { ...state.sessions, [root]: session } }));
      persistQueue = persistQueue
        .catch(() => {})
        .then(() => api.advanced!.saveSession(root, session, session.layout));
      await persistQueue;
    },
    refresh: async () => {
      const { project, desktop, tree, generation } = get();
      if (!project || !desktop) return;
      const fresh: Record<string, Entry[]> = {};
      for (const path of Object.keys(tree)) {
        try {
          fresh[path] = await api.entries(project.path, path);
        } catch (error) {
          if (!path) {
            set({ error: String(error) });
            return;
          }
        }
      }
      if (get().generation === generation) set({ tree: fresh });
    },
    createEntry: async (parent, name, directory) => {
      const { project, desktop, busy } = get();
      if (!project || !desktop || busy || !api.advanced) return;
      set({ busy: true, error: "" });
      let created: Entry | undefined;
      try {
        created = await api.advanced.create(
          project.path,
          parent,
          name,
          directory,
        );
        await get().refresh();
      } catch (error) {
        set({ error: String(error) });
      } finally {
        set({ busy: false });
      }
      if (created && !directory) await get().open(created);
    },
    renameEntry: async (path, name) => {
      const { project, desktop, busy } = get();
      if (!project || !desktop || busy || !api.advanced) return;
      set({ busy: true, error: "" });
      try {
        const target = await api.advanced.rename(project.path, path, name);
        const remap = (id: string) =>
          under(id, path) ? target.path + id.slice(path.length) : id;
        set((state) => ({
          documents: state.documents.map((document) =>
            under(document.id, path)
              ? {
                  ...document,
                  ...documentFrom(remap(document.id), document.content),
                  savedContent: document.savedContent,
                }
              : document,
          ),
          activeId: state.activeId ? remap(state.activeId) : null,
          tree: Object.fromEntries(
            Object.entries(state.tree).map(([key, entries]) => [
              remap(key),
              entries,
            ]),
          ),
          generation: state.generation + 1,
        }));
        await get().refresh();
      } catch (error) {
        set({ error: String(error) });
      } finally {
        set({ busy: false });
      }
    },
    moveFile: async (path, parent) => {
      const { project, desktop, busy, documents } = get();
      if (!project || !desktop || busy || !api.advanced) return false;
      const name = path.replace(/\\/g, "/").split("/").pop();
      if (!name) return false;
      const destination = parent ? `${parent}/${name}` : name;
      if (sameDocumentPath(path, destination)) return false;
      if (
        documents.some((document) => sameDocumentPath(document.id, destination))
      ) {
        set({
          error: "대상 경로의 문서가 이미 열려 있습니다. 먼저 닫아 주세요.",
        });
        return false;
      }
      set({ busy: true, error: "" });
      try {
        const target = await api.advanced.moveFile(project.path, path, parent);
        set((state) => ({
          documents: state.documents.map((document) =>
            sameDocumentPath(document.id, path)
              ? {
                  ...document,
                  id: target.path,
                  name: target.name,
                  folder: target.path.split("/").slice(0, -1).join("/"),
                }
              : document,
          ),
          activeId:
            state.activeId && sameDocumentPath(state.activeId, path)
              ? target.path
              : state.activeId,
          generation: state.generation + 1,
        }));
        await get().refresh();
        await get().expand(parent);
        return true;
      } catch (error) {
        set({ error: String(error) });
        return false;
      } finally {
        set({ busy: false });
      }
    },
    trashEntry: async (path) => {
      const { project, desktop, busy } = get();
      if (!project || !desktop || busy || !api.advanced) return;
      set({ busy: true, error: "" });
      try {
        await api.advanced.trash(project.path, path);
        set((state) => {
          const documents = state.documents.filter(
            (document) => !under(document.id, path),
          );
          return {
            documents,
            activeId:
              state.activeId && under(state.activeId, path)
                ? (documents[0]?.id ?? null)
                : state.activeId,
            tree: Object.fromEntries(
              Object.entries(state.tree).filter(([key]) => !under(key, path)),
            ),
            generation: state.generation + 1,
          };
        });
        await get().refresh();
      } catch (error) {
        set({ error: String(error) });
      } finally {
        set({ busy: false });
      }
    },
    updateProject: async (path, patch) => {
      if (get().busy || !get().desktop || !api.advanced) return;
      set({ busy: true, error: "" });
      try {
        const projects = await api.advanced.update(path, patch);
        set((state) => ({
          projects,
          project:
            projects.find((project) => project.path === state.project?.path) ??
            state.project,
        }));
      } catch (error) {
        set({ error: String(error) });
      } finally {
        set({ busy: false });
      }
    },
    removeProject: async (path) => {
      if (get().busy || !get().desktop || !api.advanced) return;
      set({ busy: true, error: "" });
      try {
        const projects = await api.advanced.remove(path);
        set((state) => ({
          projects,
          ...(state.project?.path === path
            ? {
                project: null,
                documents: [],
                activeId: null,
                tree: {},
                generation: state.generation + 1,
              }
            : {}),
        }));
      } catch (error) {
        set({ error: String(error) });
      } finally {
        set({ busy: false });
      }
    },
    relocateProject: async (path) => {
      if (get().busy || !get().desktop || !api.advanced) return;
      set({ busy: true, error: "" });
      let replacement: Project | undefined;
      try {
        await get().persist();
        const old = get().projects;
        const projects = await api.advanced.relocate(path);
        if (!projects) return;
        replacement =
          projects[old.findIndex((project) => project.path === path)];
        set({ projects });
      } catch (error) {
        set({ error: String(error) });
      } finally {
        set({ busy: false });
      }
      if (replacement && get().project?.path === path)
        await get().activate(replacement);
    },
  }));
  if (api.advanced) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous = "";
    store.subscribe((state) => {
      if (!state.desktop || state.busy || !state.project) return;
      const signature = JSON.stringify([
        state.project.path,
        state.documents.map((document) => document.id),
        state.activeId,
        state.layout,
      ]);
      if (signature === previous) return;
      previous = signature;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void store
          .getState()
          .persist()
          .catch((error) =>
            store.setState({ error: `작업 상태 저장 실패: ${String(error)}` }),
          );
      }, 300);
    });
  }
  return store;
}
export const useWorkspace = createWorkspaceStore();
