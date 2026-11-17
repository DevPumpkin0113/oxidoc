import type { RecoveryDocument } from "../api";
import {
  documentFrom,
  isDirty,
  sameDocumentPath,
  type Document,
} from "../model";
import type { RecoverySlice, SliceContext } from "./types";

export const recoveryDocuments = (documents: Document[]): RecoveryDocument[] =>
  documents.filter(isDirty).map((document) => ({
    path: document.id,
    content: document.content,
    savedContent: document.savedContent,
  }));

/** Serializes recovery writes so a later snapshot never lands before an earlier one. */
export function queueRecovery(
  { api, runtime }: SliceContext,
  root: string,
  documents: RecoveryDocument[],
) {
  runtime.recoveryQueue = runtime.recoveryQueue
    .catch(() => {})
    .then(() => api.advanced?.saveRecovery(root, documents));
  return runtime.recoveryQueue;
}

export function createRecoverySlice(context: SliceContext): RecoverySlice {
  const { set, get, api, runtime } = context;
  return {
    recoveryCandidates: [],
    recoveryError: "",
    recoveryReady: false,
    flushRecovery: async (clear = false) => {
      if (runtime.recoveryTimer) clearTimeout(runtime.recoveryTimer);
      runtime.recoveryTimer = undefined;
      const state = get();
      if (
        !state.desktop ||
        !state.project ||
        !api.advanced ||
        !state.recoveryReady ||
        state.recoveryCandidates.length
      )
        return;
      await queueRecovery(
        context,
        state.project.path,
        clear ? [] : recoveryDocuments(state.documents),
      );
    },
    decideRecovery: async (restore) => {
      const state = get();
      if (state.busy || !state.project || !api.advanced) return;
      const root = state.project.path;
      set({ busy: true, error: "" });
      try {
        const documents = [...state.documents];
        if (restore)
          for (const candidate of state.recoveryCandidates) {
            let disk: string | null = null;
            try {
              disk = await api.read(root, candidate.path);
            } catch {
              /* Recovery also supports deleted files. */
            }
            const recovered: Document = {
              ...documentFrom(candidate.path, candidate.savedContent),
              content: candidate.content,
              ...(disk === candidate.content
                ? { savedContent: disk }
                : disk !== candidate.savedContent
                  ? { diskContent: disk }
                  : {}),
            };
            const index = documents.findIndex((document) =>
              sameDocumentPath(document.id, candidate.path),
            );
            if (index < 0) documents.push(recovered);
            else documents[index] = recovered;
          }
        await queueRecovery(context, root, recoveryDocuments(documents));
        set({
          documents,
          activeId: restore
            ? (state.recoveryCandidates[0]?.path ?? state.activeId)
            : state.activeId,
          recoveryCandidates: [],
          recoveryError: "",
          recoveryReady: true,
        });
      } catch (error) {
        set({ error: `복구 데이터 처리 실패: ${String(error)}` });
      } finally {
        set({ busy: false });
      }
    },
  };
}
