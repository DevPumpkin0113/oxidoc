import { sampleDocuments } from "../../data/sampleDocuments";
import { documentFrom, isDirty, sameDocumentPath } from "../model";
import { isImageFile } from "../documentTypes";
import type { DocumentSlice, SliceContext } from "./types";

const MAX_CLOSED_ENTRIES = 20;

export function createDocumentSlice({
  set,
  get,
  api,
}: SliceContext): DocumentSlice {
  return {
    documents: [],
    activeId: null,
    closedEntries: {},
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
        // Images are shown from the file itself; no text to read.
        const content = isImageFile(entry.path)
          ? ""
          : desktop
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
      if (document.diskContent !== undefined) {
        set({ error: "외부 변경을 먼저 확인해 주세요." });
        return false;
      }
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
      if (
        !project ||
        !document ||
        busy ||
        !desktop ||
        !api.advanced ||
        isImageFile(id)
      )
        return false;
      set({ busy: true, error: "" });
      try {
        const path = await api.advanced.pickSave(project.path, id);
        if (!path) return false;
        const samePath = sameDocumentPath(path, id);
        if (samePath && document.diskContent !== null) {
          set({ busy: false });
          return await get().save(id);
        }
        if (
          get().documents.some(
            (item) =>
              item.id !== id &&
              sameDocumentPath(item.id, path) &&
              isDirty(item),
          )
        )
          throw new Error(
            "대상 문서에 미저장 변경이 있습니다. 먼저 저장하거나 닫아 주세요.",
          );
        const expected =
          samePath && document.diskContent === null
            ? null
            : await api.advanced.target(project.path, path);
        await api.advanced.saveAs(
          project.path,
          path,
          document.content,
          expected,
        );
        set((state) => ({
          documents: state.documents
            .filter(
              (item) => item.id === id || !sameDocumentPath(item.id, path),
            )
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
        const closed = state.documents[index];
        const root = state.project?.path;
        return {
          documents,
          closedEntries:
            root && closed
              ? {
                  ...state.closedEntries,
                  [root]: [
                    { name: closed.name, path: closed.id, isDirectory: false },
                    ...(state.closedEntries[root] ?? []).filter(
                      (entry) => !sameDocumentPath(entry.path, id),
                    ),
                  ].slice(0, MAX_CLOSED_ENTRIES),
                }
              : state.closedEntries,
          activeId:
            state.activeId === id
              ? (documents[Math.max(0, index - 1)]?.id ?? null)
              : state.activeId,
        };
      }),
    moveDocument: (id, index) =>
      set((state) => {
        const from = state.documents.findIndex(
          (document) => document.id === id,
        );
        if (from < 0) return {};
        const documents = state.documents.filter(
          (document) => document.id !== id,
        );
        const to = Math.max(0, Math.min(index, documents.length));
        if (to === from) return {};
        documents.splice(to, 0, state.documents[from]);
        return { documents };
      }),
    reopenClosed: async () => {
      const { project, busy, closedEntries } = get();
      if (!project || busy) return;
      const [entry, ...remaining] = closedEntries[project.path] ?? [];
      if (!entry) return;
      set((state) => ({
        closedEntries: { ...state.closedEntries, [project.path]: remaining },
      }));
      await get().open(entry);
    },
    noticeExternal: (id, diskContent) =>
      set((state) => ({
        documents: state.documents.map((document) => {
          if (!sameDocumentPath(document.id, id)) return document;
          if (diskContent === document.savedContent)
            return { ...document, diskContent: undefined };
          if (diskContent === document.content)
            return {
              ...document,
              savedContent: diskContent,
              diskContent: undefined,
            };
          if (
            typeof diskContent === "string" &&
            document.content === document.savedContent
          )
            return {
              ...document,
              content: diskContent,
              savedContent: diskContent,
              diskContent: undefined,
            };
          return { ...document, diskContent };
        }),
      })),
    resolveExternal: (id, reload) =>
      set((state) => ({
        documents: state.documents.map((document) => {
          if (
            !sameDocumentPath(document.id, id) ||
            typeof document.diskContent !== "string"
          )
            return document;
          return {
            ...document,
            content: reload ? document.diskContent : document.content,
            savedContent: document.diskContent,
            diskContent: undefined,
          };
        }),
      })),
    applyReplacements: async (files) => {
      const { project, desktop, busy, documents } = get();
      if (!project || !desktop || busy || !api.advanced)
        throw Error("현재 작업 공간에서 적용할 수 없습니다.");
      if (
        documents.some(
          (document) =>
            files.some((file) => sameDocumentPath(file.path, document.id)) &&
            (isDirty(document) || document.diskContent !== undefined),
        )
      )
        throw Error(
          "변경 대상에 미저장 문서 또는 확인하지 않은 외부 변경이 있습니다.",
        );
      set({ busy: true, error: "" });
      try {
        const results = await api.advanced.applyReplace(project.path, files);
        const changed = files.filter((file) =>
          results.some(
            (result) =>
              sameDocumentPath(result.path, file.path) && result.error === null,
          ),
        );
        set((state) => ({
          documents: state.documents.map((document) => {
            const file = changed.find((file) =>
              sameDocumentPath(file.path, document.id),
            );
            return file
              ? {
                  ...document,
                  content: file.after,
                  savedContent: file.after,
                  diskContent: undefined,
                }
              : document;
          }),
        }));
        await get()
          .flushRecovery()
          .catch((error) =>
            set({ error: `복구본 정리 실패: ${String(error)}` }),
          );
        await get().refresh();
        return results;
      } finally {
        set({ busy: false });
      }
    },
  };
}
