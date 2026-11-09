import { isTauri } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { DownloadEvent } from "@tauri-apps/plugin-updater";

export interface UpdatePackage {
  version: string;
  currentVersion: string;
  body?: string;
  download: (
    onEvent: (event: DownloadEvent) => void,
    options: { timeout: number },
  ) => Promise<void>;
  install: (options: { restartAfterInstall: boolean }) => Promise<void>;
  close: () => Promise<void>;
}
interface UpdateApi {
  enabled: () => boolean;
  check: () => Promise<UpdatePackage | null>;
}
type Phase =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";
interface State {
  phase: Phase;
  version: string;
  notes: string;
  error: string;
  downloaded: number;
  total?: number;
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: (prepare: () => Promise<boolean>) => Promise<void>;
}

// The endpoint only publishes stable releases. Also reject accidental prerelease
// manifests rather than offering a preview build to stable-channel users.
export function isNewerStableRelease(candidate: string, current: string) {
  const stable = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[\w.-]+)?$/;
  const next = candidate.match(stable);
  const installed = current.replace(/-[^+]+/, "").match(stable);
  if (!next || !installed) return false;
  for (let index = 1; index <= 3; index++) {
    const difference = BigInt(next[index]) - BigInt(installed[index]);
    if (difference) return difference > 0;
  }
  return current.split("+")[0].includes("-");
}

export function createUpdaterStore(
  api: UpdateApi = {
    enabled: isTauri,
    check: async () =>
      (await import("@tauri-apps/plugin-updater")).check({ timeout: 15000 }),
  },
) {
  let update: UpdatePackage | null = null;
  return create<State>((set, get) => ({
    phase: "idle",
    version: "",
    notes: "",
    error: "",
    downloaded: 0,
    check: async () => {
      if (
        !api.enabled() ||
        ["checking", "downloading", "ready", "installing"].includes(get().phase)
      )
        return;
      set({
        phase: "checking",
        error: "",
        version: "",
        notes: "",
        downloaded: 0,
        total: undefined,
      });
      try {
        await update?.close();
        update = null;
        const result = await api.check();
        if (
          result &&
          isNewerStableRelease(result.version, result.currentVersion)
        ) {
          update = result;
          set({
            phase: "available",
            version: result.version,
            notes: result.body ?? "",
          });
        } else {
          await result?.close();
          set({ phase: "current" });
        }
      } catch (error) {
        set({ phase: "error", error: String(error) });
      }
    },
    download: async () => {
      if (!update || !["available", "error"].includes(get().phase)) return;
      set({ phase: "downloading", error: "", downloaded: 0, total: undefined });
      try {
        await update.download(
          (event) => {
            if (event.event === "Started")
              set({ total: event.data.contentLength });
            if (event.event === "Progress")
              set((state) => ({
                downloaded: state.downloaded + event.data.chunkLength,
              }));
          },
          { timeout: 120000 },
        );
        // download() only resolves after the native signature check succeeds.
        set({ phase: "ready" });
      } catch (error) {
        set({ phase: "error", error: String(error) });
      }
    },
    install: async (prepare) => {
      if (!update || get().phase !== "ready") return;
      set({ phase: "installing", error: "" });
      try {
        if (!(await prepare())) {
          set({ phase: "ready" });
          return;
        }
        await update.install({ restartAfterInstall: true });
        // Windows exits from the native install command; retain the state while
        // its installer takes over and restarts the application.
      } catch (error) {
        set({ phase: "ready", error: String(error) });
      }
    },
  }));
}
export const useUpdater = createUpdaterStore();
