import { sampleDocuments } from "../../data/sampleDocuments";
import type { Entry, Project, RecoveryDocument } from "../api";
import {
  documentFrom,
  isDirty,
  isExternal,
  parseLayout,
  parseSession,
  record,
  sameDocumentPath,
  type Document,
  type Session,
} from "../model";
import { queueRecovery } from "./recoverySlice";
import { isImageFile } from "../documentTypes";
import type { ParkedWorkspace, ProjectSlice, SliceContext } from "./types";

const SAMPLE_PROJECT: Project = { name: "샘플 작업 공간", path: "sample" };

/** The tab list with `project` added at the end, or updated in place. */
const withTab = (tabs: Project[], project: Project) =>
  tabs.some((tab) => tab.path === project.path)
    ? tabs.map((tab) => (tab.path === project.path ? project : tab))
    : [...tabs, project];

function without<T>(record: Record<string, T>, key: string) {
  const rest = { ...record };
  delete rest[key];
  return rest;
}

/** Browser preview workspace built from bundled sample documents. */
function sampleWorkspace() {
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
  return {
    projects: [SAMPLE_PROJECT],
    project: SAMPLE_PROJECT,
    openProjects: [SAMPLE_PROJECT],
    tree,
    documents: documents.slice(0, 2),
    activeId: "readme",
  };
}

export function createProjectSlice(context: SliceContext): ProjectSlice {
  const { set, get, api, runtime } = context;
  /** Runs a desktop project-list operation with busy/error handling. */
  async function operate(run: () => Promise<void>) {
    if (get().busy || !get().desktop || !api.advanced) return;
    set({ busy: true, error: "" });
    try {
      await run();
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ busy: false });
    }
  }

  /** Saves the registered project tabs; External is not restored. */
  function saveTabs() {
    void api.advanced
      ?.saveOpenProjects(
        get()
          .openProjects.filter((project) => !isExternal(project))
          .map((project) => project.path),
      )
      .catch((error) =>
        set({ error: `작업 상태 저장 실패: ${String(error)}` }),
      );
  }

  /** Keeps the active tab's state in memory and on disk before another is shown. */
  async function park() {
    const state = get();
    if (!state.project) return;
    await get().persist();
    // Unsaved edits stay recoverable while the tab is in the background.
    await get().flushRecovery();
    const { project, documents, activeId, tree, layout } = get();
    const { recoveryCandidates, recoveryError, recoveryReady } = get();
    set((state) => ({
      parked: {
        ...state.parked,
        [project!.path]: {
          project: project!,
          documents,
          activeId,
          tree,
          layout,
          recoveryCandidates,
          recoveryError,
          recoveryReady,
        },
      },
    }));
  }

  /** Shows a parked tab as it was left; the monitor re-checks its files. */
  function restore(parked: ParkedWorkspace) {
    set((state) => ({
      project:
        state.projects.find((item) => item.path === parked.project.path) ??
        parked.project,
      documents: parked.documents,
      activeId: parked.activeId,
      tree: parked.tree,
      layout: parked.layout,
      recoveryCandidates: parked.recoveryCandidates,
      recoveryError: parked.recoveryError,
      recoveryReady: parked.recoveryReady,
      parked: without(state.parked, parked.project.path),
      openProjects: withTab(state.openProjects, parked.project),
      generation: state.generation + 1,
    }));
    saveTabs();
  }

  return {
    projects: [],
    project: null,
    sessions: {},
    openProjects: [],
    parked: {},
    initialize: async (desktop, start) => {
      if (get().initialized) return;
      set({ initialized: true, desktop, busy: desktop, error: "" });
      if (!desktop) {
        set(sampleWorkspace());
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
          // Tabs other than the started one open when they are selected.
          const tabs = Array.isArray(saved.openProjects)
            ? saved.openProjects.flatMap((path) =>
                projects.filter((project) => project.path === path),
              )
            : [];
          set({ layout: parseLayout(saved.layout), openProjects: tabs });
          // A file opened through the OS starts in its own project.
          const project = isExternal(start)
            ? start
            : (projects.find((project) => project.path === start?.path) ??
              projects.find((project) => project.path === saved.lastProject));
          set({ busy: false });
          if (project) {
            if (project.status && project.status !== "available") {
              set({
                error:
                  "이전 프로젝트에 접근할 수 없습니다. 프로젝트에서 경로를 다시 연결해 주세요.",
                layout: { ...get().layout, activity: "projects" },
              });
              try {
                const candidates = await api.advanced.loadRecovery(
                  project.path,
                );
                if (candidates.length) await get().activate(project);
              } catch {
                await get().activate(project);
              }
            } else await get().activate(project);
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
      const current = get().project;
      const switching = !!current && current.path !== project.path;
      try {
        // The current tab keeps its documents, including unsaved edits.
        if (switching) await park();
        const parked = get().parked[project.path];
        if (parked && project.path !== current?.path) {
          restore(parked);
          return true;
        }
        // A relocated project clears recoveryReady so its old state is not
        // written over the new path.
        if (!switching && get().recoveryReady) await get().persist();
        let recoveryCandidates: RecoveryDocument[] = [];
        let recoveryError = "";
        try {
          recoveryCandidates =
            (await api.advanced?.loadRecovery(project.path)) ?? [];
        } catch (error) {
          recoveryError = String(error);
        }
        let entries: Entry[] = [];
        let unavailable = "";
        try {
          entries = await api.entries(project.path, "");
        } catch (error) {
          if (!recoveryCandidates.length && !recoveryError) throw error;
          unavailable = String(error);
        }
        const saved =
          (unavailable ? undefined : get().sessions[project.path]) ??
          parseSession(
            api.advanced && !unavailable
              ? await api.advanced.loadSession(project.path)
              : {},
            { ...get().layout, activity: "files" },
          );
        const restored: Document[] = [];
        const missing: string[] = [];
        for (const path of saved.paths) {
          try {
            restored.push(
              documentFrom(
                path,
                isImageFile(path) ? "" : await api.read(project.path, path),
              ),
            );
          } catch {
            missing.push(path);
          }
        }
        // Reopening the same project replaces its documents; a parked tab
        // already saved its own snapshot.
        if (!switching) await get().flushRecovery(true);
        set((state) => ({
          openProjects: withTab(state.openProjects, project),
          project: unavailable
            ? { ...project, status: "unavailable" }
            : project,
          recoveryCandidates,
          recoveryError,
          recoveryReady: !recoveryError,
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
          error:
            unavailable ||
            (missing.length ? `복원하지 못한 문서: ${missing.join(", ")}` : ""),
        }));
        // Single-file workspaces are not in the project list.
        if (api.advanced && !unavailable && !isExternal(project))
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
        saveTabs();
        return true;
      } catch (error) {
        // The window still shows the current tab.
        if (switching && current)
          set((state) => ({ parked: without(state.parked, current.path) }));
        set({ error: String(error) });
        return false;
      } finally {
        set({ busy: false });
      }
    },
    closeProject: async (path) => {
      const state = get();
      if (state.busy || !state.desktop) return;
      const index = state.openProjects.findIndex((item) => item.path === path);
      const rest = state.openProjects.filter((item) => item.path !== path);
      if (state.project?.path !== path) {
        set({ openProjects: rest, parked: without(state.parked, path) });
        saveTabs();
        return;
      }
      await get().persist();
      await get().flushRecovery(true);
      set((state) => ({
        openProjects: rest,
        project: null,
        documents: [],
        activeId: null,
        tree: {},
        recoveryCandidates: [],
        recoveryError: "",
        recoveryReady: false,
        generation: state.generation + 1,
      }));
      saveTabs();
      const next = rest[Math.min(Math.max(index, 0), rest.length - 1)];
      if (next) await get().activate(next);
    },
    moveProject: (path, index) => {
      const tabs = get().openProjects;
      const tab = tabs.find((item) => item.path === path);
      if (!tab) return;
      const rest = tabs.filter((item) => item !== tab);
      const target = Math.max(0, Math.min(index, rest.length));
      set({
        openProjects: [...rest.slice(0, target), tab, ...rest.slice(target)],
      });
      saveTabs();
    },
    saveParked: async (path) => {
      const parked = get().parked[path];
      if (!parked) return true;
      const documents = [...parked.documents];
      try {
        for (const [index, document] of documents.entries()) {
          if (!isDirty(document)) continue;
          if (document.diskContent !== undefined)
            throw `외부 변경을 먼저 확인해 주세요: ${document.name}`;
          await api.save(
            path,
            document.id,
            document.content,
            document.savedContent,
          );
          documents[index] = { ...document, savedContent: document.content };
        }
        await queueRecovery(context, path, []);
        return true;
      } catch (error) {
        set({ error: String(error) });
        return false;
      } finally {
        // Keep what was saved even when a later document fails.
        set((state) =>
          state.parked[path]
            ? {
                parked: {
                  ...state.parked,
                  [path]: { ...state.parked[path], documents },
                },
              }
            : {},
        );
      }
    },
    discardParked: async (path) => {
      if (get().parked[path]?.recoveryReady)
        await queueRecovery(context, path, []);
    },
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
      const advanced = api.advanced;
      runtime.persistQueue = runtime.persistQueue
        .catch(() => {})
        .then(() => advanced.saveSession(root, session, session.layout));
      await runtime.persistQueue;
    },
    updateProject: (path, patch) =>
      operate(async () => {
        const projects = await api.advanced!.update(path, patch);
        set((state) => ({
          projects,
          project:
            projects.find((project) => project.path === state.project?.path) ??
            state.project,
        }));
      }),
    removeProject: (path) =>
      operate(async () => {
        const projects = await api.advanced!.remove(path);
        set((state) => ({
          projects,
          openProjects: state.openProjects.filter((item) => item.path !== path),
          parked: without(state.parked, path),
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
        saveTabs();
      }),
    relocateProject: async (path) => {
      let replacement: Project | undefined;
      const wasActive = get().project?.path === path;
      const discardedLocal =
        wasActive &&
        get().documents.some(isDirty) &&
        !get().recoveryCandidates.length &&
        !get().recoveryError;
      await operate(async () => {
        await get().persist();
        await get().flushRecovery();
        const old = get().projects;
        const projects = await api.advanced!.relocate(path);
        if (!projects) return;
        replacement =
          projects[old.findIndex((project) => project.path === path)];
        const moved = replacement;
        set((state) => {
          const parked = state.parked[path];
          return {
            projects,
            openProjects: moved
              ? state.openProjects.map((item) =>
                  item.path === path ? moved : item,
                )
              : state.openProjects,
            parked:
              parked && moved
                ? {
                    ...without(state.parked, path),
                    [moved.path]: { ...parked, project: moved },
                  }
                : state.parked,
            ...(wasActive && moved
              ? { project: moved, recoveryReady: false }
              : {}),
          };
        });
        saveTabs();
        if (replacement && discardedLocal)
          await queueRecovery(context, replacement.path, []);
      });
      if (replacement && wasActive) await get().activate(replacement);
    },
  };
}
