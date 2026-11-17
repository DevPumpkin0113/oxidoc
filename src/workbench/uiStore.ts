import { createRef } from "react";
import { create } from "zustand";
import type { ActionRequest } from "../components/ActionDialog";
import type { PaletteCommand } from "../components/CommandPalette";
import type { MenuItem } from "../components/ContextMenu";
import type { EditorCommand } from "../components/MarkdownEditor";
import type { Navigation, ScrollTarget } from "../components/MarkdownPreview";
import type { UnsavedChoice } from "../components/UnsavedDialog";
import type { SearchResults } from "../workspace/api";
import type { LinkUpdateRequest } from "./linkUpdates";
import {
  defaultSearchOptions,
  type SearchOptions,
} from "../workspace/searchOptions";

export interface ContextMenuState {
  x: number;
  y: number;
  items: MenuItem[];
  returnFocus: HTMLElement | null;
  title?: string;
}

/** Project search sidebar input, conditions and last response. */
export interface SearchState {
  query: string;
  options: SearchOptions;
  showPatterns: boolean;
  revision: number;
  response?: { key: string; results: SearchResults; error?: string };
}

/** Workbench UI state shared by the shell components and command modules. */
export interface UiState {
  settingsOpen: boolean;
  palette: boolean;
  paletteCommands: PaletteCommand[];
  quickOpen: boolean;
  replaceOpen: boolean;
  menu: ContextMenuState | null;
  actionRequest: ActionRequest | null;
  confirmation: {
    names: string[];
    resolve: (choice: UnsavedChoice) => void;
  } | null;
  searchScope: { root: string; path: string } | null;
  search: SearchState;
  linkUpdate: LinkUpdateRequest | null;
  command?: EditorCommand;
  navigation?: Navigation & { documentId: string };
  scrollTarget?: ScrollTarget & { documentId: string };
  revealTarget: string | null;
  sampleNotice: boolean;
}

export const useUi = create<UiState>(() => ({
  settingsOpen: false,
  palette: false,
  paletteCommands: [],
  quickOpen: false,
  replaceOpen: false,
  menu: null,
  actionRequest: null,
  confirmation: null,
  searchScope: null,
  search: {
    query: "",
    options: defaultSearchOptions,
    showPatterns: false,
    revision: 0,
  },
  linkUpdate: null,
  revealTarget: null,
  sampleNotice: true,
}));

export const isModalOpen = (state: UiState) =>
  Boolean(
    state.confirmation ||
    state.actionRequest ||
    state.palette ||
    state.quickOpen ||
    state.replaceOpen ||
    state.linkUpdate ||
    state.menu,
  );

// One unsaved-changes prompt is shared by concurrent confirmDocuments calls.
export const pendingChoice: { current: Promise<UnsavedChoice> | null } = {
  current: null,
};

/** Clears workbench UI state; the shell mounts once, tests reset it per case. */
export function resetWorkbench() {
  pendingChoice.current = null;
  useUi.setState(useUi.getInitialState(), true);
}

// The app has a single workbench, so its focus targets are module singletons.
export const explorerTree = createRef<HTMLDetailsElement | null>();
export const searchInput = createRef<HTMLInputElement | null>();
export const outlineTrigger = createRef<HTMLButtonElement | null>();
