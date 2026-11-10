import { expect, it } from "vitest";
import { isDocumentFile, isMermaidFile, visibleEntries } from "./documentTypes";
import { defaultLayout, parseLayout } from "./store";
it("document extensions and persisted view defaults", () => {
  expect(["notes.MD", "a.mmd", "a.MERMAID"].every(isDocumentFile)).toBe(true);
  expect(isDocumentFile("README.txt")).toBe(false);
  expect(isMermaidFile("a.mmd")).toBe(true);
  expect(parseLayout({}).explorerView).toBe("documents");
  expect(parseLayout({ explorerView: "all" }).explorerView).toBe("all");
  expect(parseLayout({ explorerView: "invalid" }).explorerView).toBe(
    defaultLayout.explorerView,
  );
});
it("default view prunes nested non-document/empty folders, all view preserves them", () => {
  const entries = [
    {
      path: "empty",
      name: "empty",
      isDirectory: true,
      hasChildren: false,
      hasDocuments: false,
    },
    { path: "chain", name: "chain", isDirectory: true },
    { path: "docs", name: "docs", isDirectory: true },
    { path: "notes.MD", name: "notes.MD", isDirectory: false },
    { path: "image.png", name: "image.png", isDirectory: false },
  ];
  const tree = {
    chain: [{ path: "chain/child", name: "child", isDirectory: true }],
    "chain/child": [],
    docs: [{ path: "docs/flow.mmd", name: "flow.mmd", isDirectory: false }],
  };
  expect(
    visibleEntries(entries, tree, "documents").map((entry) => entry.path),
  ).toEqual(["docs", "notes.MD"]);
  expect(visibleEntries(entries, tree, "all")).toEqual(entries);
});
