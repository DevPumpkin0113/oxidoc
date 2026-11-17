import type { StoreApi } from "zustand";
import type { Runtime, WorkspaceState } from "./slices/types";

const RECOVERY_DELAY_MS = 750;
const SESSION_DELAY_MS = 300;

/** Debounced recovery snapshots of unsaved documents. */
function saveRecoveryOnEdit(store: StoreApi<WorkspaceState>, runtime: Runtime) {
  store.subscribe((state, previous) => {
    if (state.project?.path !== previous.project?.path) {
      if (runtime.recoveryTimer) clearTimeout(runtime.recoveryTimer);
      runtime.recoveryTimer = undefined;
      return;
    }
    if (
      state.documents === previous.documents &&
      state.recoveryReady === previous.recoveryReady &&
      state.recoveryCandidates === previous.recoveryCandidates
    )
      return;
    if (
      !state.desktop ||
      !state.project ||
      !state.recoveryReady ||
      state.recoveryCandidates.length
    )
      return;
    if (runtime.recoveryTimer) clearTimeout(runtime.recoveryTimer);
    runtime.recoveryTimer = setTimeout(() => {
      void store
        .getState()
        .flushRecovery()
        .catch((error) =>
          store.setState({
            error: `미저장 복구본 저장 실패: ${String(error)}`,
          }),
        );
    }, RECOVERY_DELAY_MS);
  });
}

/** Debounced session saves when open documents, active tab or layout change. */
function saveSessionOnChange(store: StoreApi<WorkspaceState>) {
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
    }, SESSION_DELAY_MS);
  });
}

export function attachPersistence(
  store: StoreApi<WorkspaceState>,
  runtime: Runtime,
) {
  saveRecoveryOnEdit(store, runtime);
  saveSessionOnChange(store);
}
