import { expect, it, vi } from "vitest";
import {
  createUpdaterStore,
  isNewerStableRelease,
  type UpdatePackage,
} from "./updater";
import type { DownloadEvent } from "@tauri-apps/plugin-updater";
function fixture() {
  const update: UpdatePackage = {
    version: "0.3.0",
    currentVersion: "0.2.0",
    body: "changes",
    download: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const api = { enabled: () => true, check: vi.fn().mockResolvedValue(update) };
  return { update, api, store: createUpdaterStore(api) };
}
it("stable version comparison excludes older/equal/prerelease and ignores build metadata", () => {
  expect(isNewerStableRelease("0.3.0", "0.2.0")).toBe(true);
  expect(isNewerStableRelease("1.10.0", "1.9.9")).toBe(true);
  expect(isNewerStableRelease("0.3.0-beta.1", "0.2.0")).toBe(false);
  expect(isNewerStableRelease("0.2.0+build.2", "0.2.0+build.1")).toBe(false);
  expect(isNewerStableRelease("0.1.9", "0.2.0")).toBe(false);
  expect(isNewerStableRelease("bad", "0.2.0")).toBe(false);
  expect(isNewerStableRelease("0.3.0", "0.3.0-beta.1")).toBe(true);
});
it("check and download remain serialized, verified download required before confirmed install", async () => {
  const { store, update, api } = fixture();
  const prepare = vi.fn().mockResolvedValue(false);
  await store.getState().install(prepare);
  expect(prepare).not.toHaveBeenCalled();
  await Promise.all([store.getState().check(), store.getState().check()]);
  expect(api.check).toHaveBeenCalledOnce();
  expect(store.getState()).toMatchObject({
    phase: "available",
    version: "0.3.0",
    notes: "changes",
  });
  let finish!: () => void;
  vi.mocked(update.download).mockImplementationOnce(async (onEvent) => {
    onEvent({ event: "Started", data: { contentLength: 20 } });
    onEvent({ event: "Progress", data: { chunkLength: 8 } });
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const download = store.getState().download();
  expect(store.getState()).toMatchObject({
    phase: "downloading",
    downloaded: 8,
    total: 20,
  });
  await store.getState().check();
  expect(api.check).toHaveBeenCalledOnce();
  await store.getState().install(prepare);
  expect(prepare).not.toHaveBeenCalled();
  finish();
  await download;
  expect(store.getState().phase).toBe("ready");
  await store.getState().install(prepare);
  expect(update.install).not.toHaveBeenCalled();
  expect(store.getState().phase).toBe("ready");
  prepare.mockResolvedValue(true);
  await store.getState().install(prepare);
  expect(update.install).toHaveBeenCalledWith({ restartAfterInstall: true });
});
it("offline checks retry and untrusted downloads never permit installation", async () => {
  const { api, store, update } = fixture();
  api.check.mockRejectedValueOnce(Error("offline"));
  await store.getState().check();
  expect(store.getState()).toMatchObject({
    phase: "error",
    error: "Error: offline",
  });
  await store.getState().check();
  vi.mocked(update.download).mockImplementationOnce(
    async (onEvent: (event: DownloadEvent) => void) => {
      onEvent({ event: "Finished" });
      throw Error("invalid signature");
    },
  );
  await store.getState().download();
  expect(store.getState().phase).toBe("error");
  await store.getState().install(vi.fn().mockResolvedValue(true));
  expect(update.install).not.toHaveBeenCalled();
});
it("ignore stable feed older/equal/prerelease, release resources on recheck", async () => {
  const { store, update } = fixture();
  update.version = "0.2.0";
  await store.getState().check();
  expect(store.getState().phase).toBe("current");
  expect(update.close).toHaveBeenCalledOnce();
});
it("save/prepare and installer failures keep a retryable verified package", async () => {
  const { store, update } = fixture();
  await store.getState().check();
  await store.getState().download();
  await store.getState().install(async () => {
    throw Error("save failed");
  });
  expect(update.install).not.toHaveBeenCalled();
  expect(store.getState()).toMatchObject({
    phase: "ready",
    error: "Error: save failed",
  });
  vi.mocked(update.install).mockRejectedValueOnce(Error("install failed"));
  await store.getState().install(async () => true);
  expect(store.getState()).toMatchObject({
    phase: "ready",
    error: "Error: install failed",
  });
});
