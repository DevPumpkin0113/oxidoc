import { create } from "zustand";
import { invoke, isTauri } from "@tauri-apps/api/core";
import packageInfo from "../../package.json";
import { themeById } from "./themes";
export interface Settings {
  language: "system" | "ko" | "en";
  mode: "system" | "light" | "dark";
  lightTheme: string;
  darkTheme: string;
  uiFontSize: number;
  editorFontSize: number;
  previewFontSize: number;
}
export const defaults: Settings = {
  language: "system",
  mode: "system",
  lightTheme: "light-modern",
  darkTheme: "dark-modern",
  uiFontSize: 13,
  editorFontSize: 13,
  previewFontSize: 15,
};
export function languageFor(locale: string) {
  return /^ko(?:[-_]|$)/i.test(locale) ? "ko" : "en";
}
export function parseSettings(input: unknown): Settings {
  const data =
    input && typeof input === "object" ? (input as Partial<Settings>) : {};
  const size = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
      ? value
      : fallback;
  return {
    language: ["system", "ko", "en"].includes(String(data.language))
      ? data.language!
      : "system",
    mode: ["system", "light", "dark"].includes(String(data.mode))
      ? data.mode!
      : "system",
    lightTheme:
      data.lightTheme &&
      themeById(data.lightTheme).id === data.lightTheme &&
      themeById(data.lightTheme).kind === "light"
        ? data.lightTheme
        : defaults.lightTheme,
    darkTheme:
      data.darkTheme &&
      themeById(data.darkTheme).id === data.darkTheme &&
      themeById(data.darkTheme).kind === "dark"
        ? data.darkTheme
        : defaults.darkTheme,
    uiFontSize: size(data.uiFontSize, 11, 20, defaults.uiFontSize),
    editorFontSize: size(data.editorFontSize, 10, 32, defaults.editorFontSize),
    previewFontSize: size(
      data.previewFontSize,
      12,
      32,
      defaults.previewFontSize,
    ),
  };
}
export interface SettingsApi {
  load: () => Promise<unknown>;
  save: (settings: Settings) => Promise<void>;
  info: () => Promise<{ version: string; locale: string }>;
}
const settingsApi: SettingsApi = {
  load: async () =>
    isTauri()
      ? invoke("load_settings")
      : JSON.parse(localStorage.getItem("oxidoc.settings.v1") ?? "null"),
  save: async (settings) => {
    if (isTauri()) await invoke("save_settings", { settings });
    else localStorage.setItem("oxidoc.settings.v1", JSON.stringify(settings));
  },
  info: async () =>
    isTauri()
      ? invoke("runtime_info")
      : { version: packageInfo.version, locale: navigator.language },
};
interface State {
  settings: Settings;
  initialized: boolean;
  error: string;
  version: string;
  systemLocale: string;
  systemDark: boolean;
  initialize: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
  reset: () => Promise<void>;
  refreshLocale: () => Promise<void>;
  flush: () => Promise<void>;
}
export function createSettingsStore(api = settingsApi) {
  let queue = Promise.resolve();
  let loading: Promise<void> | undefined;
  let revision = 0;
  return create<State>((set, get) => ({
    settings: { ...defaults },
    initialized: false,
    error: "",
    version: packageInfo.version,
    systemLocale: typeof navigator === "undefined" ? "en" : navigator.language,
    systemDark:
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-color-scheme: dark)").matches,
    initialize: async () => {
      if (get().initialized) return;
      if (loading) return loading;
      loading = (async () => {
        const results = await Promise.allSettled([api.load(), api.info()]);
        if (results[0].status === "fulfilled")
          set({ settings: parseSettings(results[0].value) });
        else set({ error: `설정 불러오기 실패: ${String(results[0].reason)}` });
        if (results[1].status === "fulfilled" && results[1].value)
          set({
            version: results[1].value.version,
            systemLocale: results[1].value.locale || get().systemLocale,
          });
        set({ initialized: true });
      })();
      return loading;
    },
    update: async (patch) => {
      const request = ++revision;
      const settings = parseSettings({ ...get().settings, ...patch });
      set({ settings, error: "" });
      queue = queue.catch(() => {}).then(() => api.save(settings));
      try {
        await queue;
        if (request === revision) set({ error: "" });
      } catch (error) {
        if (request === revision)
          set({ error: `설정 저장 실패: ${String(error)}` });
      }
    },
    flush: async () => {
      let pending: Promise<void>;
      do {
        pending = queue;
        try {
          await pending;
        } catch (error) {
          if (pending === queue) throw error;
        }
      } while (pending !== queue);
    },
    reset: async () => get().update({ ...defaults }),
    refreshLocale: async () => {
      try {
        const info = await api.info();
        set({ systemLocale: info.locale || navigator.language });
      } catch {
        /* Retain the last known system locale. */
      }
    },
  }));
}
export const useSettings = createSettingsStore();
export function effectiveLanguage(
  state: Pick<State, "settings" | "systemLocale">,
) {
  return state.settings.language === "system"
    ? languageFor(state.systemLocale)
    : state.settings.language;
}
export function effectiveTheme(state: Pick<State, "settings" | "systemDark">) {
  const dark =
    state.settings.mode === "system"
      ? state.systemDark
      : state.settings.mode === "dark";
  return themeById(dark ? state.settings.darkTheme : state.settings.lightTheme);
}
