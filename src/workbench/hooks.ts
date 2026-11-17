import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  effectiveLanguage,
  effectiveTheme,
  useSettings,
} from "../settings/store";
import { themeVariables } from "../settings/themes";
import { useUpdater } from "../settings/updater";
import { startWorkspaceMonitor } from "../workspace/monitor";
import { useWorkspace } from "../workspace/store";
import { blockExternalFileDrop } from "../workspace/treeDrag";
import { confirmDocuments } from "./dialogs";
import { handleContextMenu, handleKeydown } from "./globalEvents";
import { isModalOpen, useUi } from "./uiStore";

const UPDATE_CHECK_DELAY_MS = 3000;

/** Settings initialization, theme variables and system preference listeners. */
export function useAppearance() {
  const language = useSettings(effectiveLanguage);
  const theme = useSettings(effectiveTheme);
  const initialized = useSettings((state) => state.initialized);
  const uiFontSize = useSettings((state) => state.settings.uiFontSize);
  const previewFontSize = useSettings(
    (state) => state.settings.previewFontSize,
  );
  useEffect(() => {
    void useSettings.getState().initialize();
  }, []);
  useEffect(() => {
    if (!isTauri() || !initialized) return;
    const timer = setTimeout(() => {
      if (useUpdater.getState().phase === "idle")
        void useUpdater.getState().check();
    }, UPDATE_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [initialized]);
  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.style.colorScheme = theme.kind;
    root.dataset.theme = theme.id;
    for (const [key, value] of Object.entries(themeVariables(theme)))
      root.style.setProperty(key, value);
    root.style.setProperty("--ui-font-size", `${uiFontSize}px`);
    root.style.setProperty("--preview-font-size", `${previewFontSize}px`);
  }, [language, theme, uiFontSize, previewFontSize]);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const changed = () =>
      useSettings.setState({ systemDark: media?.matches ?? false });
    const locale = () => {
      void useSettings.getState().refreshLocale();
    };
    media?.addEventListener("change", changed);
    window.addEventListener("languagechange", locale);
    window.addEventListener("focus", locale);
    return () => {
      media?.removeEventListener("change", changed);
      window.removeEventListener("languagechange", locale);
      window.removeEventListener("focus", locale);
    };
  }, []);
}

/** Workspace startup, change monitoring and window-level input handlers. */
export function useWorkbench() {
  const desktop = useWorkspace((state) => state.desktop);
  const root = useWorkspace((state) => state.project?.path);
  const status = useWorkspace((state) => state.project?.status);
  useEffect(() => {
    void useWorkspace.getState().initialize(isTauri());
  }, []);
  useEffect(() => {
    if (desktop && root && (!status || status === "available"))
      return startWorkspaceMonitor(root);
  }, [desktop, root, status]);
  useEffect(() => {
    document.addEventListener("dragover", blockExternalFileDrop, true);
    document.addEventListener("drop", blockExternalFileDrop, true);
    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("dragover", blockExternalFileDrop, true);
      document.removeEventListener("drop", blockExternalFileDrop, true);
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeydown);
    };
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    let confirming = false;
    const appWindow = getCurrentWindow();
    void appWindow
      .onCloseRequested(async (event) => {
        const state = useWorkspace.getState();
        event.preventDefault();
        if (confirming || state.busy || isModalOpen(useUi.getState())) return;
        confirming = true;
        try {
          if (await confirmDocuments(state.documents)) {
            await useWorkspace.getState().persist();
            await useSettings.getState().flush();
            await useWorkspace.getState().flushRecovery(true);
            await appWindow.destroy();
          }
        } catch (error) {
          await useWorkspace
            .getState()
            .flushRecovery()
            .catch(() => {});
          useWorkspace.setState({ error: String(error) });
        } finally {
          confirming = false;
        }
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else stop = unlisten;
      })
      .catch((error) => useWorkspace.setState({ error: String(error) }));
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
}
