import { sampleDocuments } from "../../data/sampleDocuments";
import type { Entry, Project, RecoveryDocument } from "../api";
import {
  documentFrom,
  isDirty,
  parseLayout,
  parseSession,
  record,
  sameDocumentPath,
  type Document,
  type Session,
} from "../model";
import { queueRecovery } from "./recoverySlice";
import type { ProjectSlice, SliceContext } from "./types";

const SAMPLE_PROJECT: Project = { name: "샘플 작업 공간", path: "sample" };

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

  return {
    projects: [],
    project: null,
    sessions: {},
    initialize: async (desktop) => {
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
          set({ layout: parseLayout(saved.layout) });
          const project = projects.find(
            (project) => project.path === saved.lastProject,
          );
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
      try {
        if (get().project?.path !== project.path || get().recoveryReady)
          await get().persist();
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
              documentFrom(path, await api.read(project.path, path)),
            );
          } catch {
            missing.push(path);
          }
        }
        await get().flushRecovery(true);
        set((state) => ({
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
        if (api.advanced && !unavailable)
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
        set({
          projects,
          ...(wasActive && replacement
            ? { project: replacement, recoveryReady: false }
            : {}),
        });
        if (replacement && discardedLocal)
          await queueRecovery(context, replacement.path, []);
      });
      if (replacement && wasActive) await get().activate(replacement);
    },
  };
}
