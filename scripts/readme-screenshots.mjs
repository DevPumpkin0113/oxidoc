// Captures README screenshots (.github/assets) from the browser preview with
// headless Edge over the DevTools protocol. Run `npm run dev` first, then
// `npm run screenshots`. Set EDGE_PATH if Edge is installed elsewhere.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { log } from "node:console";
import { Buffer } from "node:buffer";

const out = process.argv[2] ?? ".github/assets";
mkdirSync(out, { recursive: true });
const EDGE =
  process.env.EDGE_PATH ??
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), "oxidoc-shots-"));
const edge = spawn(EDGE, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  "--window-size=1280,800",
  "--hide-scrollbars",
  "--lang=ko-KR",
  "about:blank",
]);
const sleep = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));

let targets;
for (let i = 0; i < 50; i++) {
  try {
    targets = await (
      await globalThis.fetch(`http://127.0.0.1:${PORT}/json`)
    ).json();
    if (targets.some((t) => t.type === "page")) break;
  } catch {
    // Edge is still starting.
  }
  await sleep(200);
}
const page = targets.find((t) => t.type === "page");
const ws = new globalThis.WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, (msg) =>
      msg.error
        ? reject(Error(`${method}: ${msg.error.message}`))
        : resolve(msg.result),
    );
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const key = async (key, code, modifiers = 0, windowsVirtualKeyCode) => {
  for (const type of ["keyDown", "keyUp"])
    await send("Input.dispatchKeyEvent", {
      type,
      key,
      code,
      modifiers,
      windowsVirtualKeyCode,
    });
};
const click = (selector) =>
  evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw Error("missing ${selector.replace(/"/g, "'")}"); el.click(); return true; })()`,
  );
const shot = async (name) => {
  await sleep(700);
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(out, name), Buffer.from(data, "base64"));
  log("saved", name);
};
const scheme = (value) =>
  send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value }],
  });

await send("Page.enable");
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
});
await scheme("dark");
await send("Page.navigate", { url: "http://127.0.0.1:1420/" });
await sleep(3500);
await evaluate(
  `localStorage.setItem("oxidoc.settings.v1", JSON.stringify({language:"system",mode:"system",lightTheme:"light-modern",darkTheme:"dark-modern",uiFontSize:13,editorFontSize:13,previewFontSize:15,editorFontFamily:"",editorWordWrap:true})); true`,
);
await send("Page.reload");
await sleep(3500);
await click('[aria-label="샘플 안내 닫기"]').catch(() => {});
await shot("screenshot-001.png");

// Code highlighting, Mermaid and a table in the split view.
await click('[aria-label="탐색기"]');
await evaluate(
  `(() => { const t = [...document.querySelectorAll('[aria-label="가이드"], button')].find(b => b.textContent.trim() === "가이드"); t && t.click(); return true; })()`,
).catch(() => {});
await sleep(400);
await evaluate(
  `(() => { const t = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === "시작하기.md"); if (!t) throw Error("no doc"); t.click(); return true; })()`,
);
await sleep(1500);
const doc = [
  "# 배포 흐름",
  "",
  "릴리즈는 `develop`에서 검증한 뒤 `main`으로 올립니다.",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[작성] --> B{검토}",
  "  B -->|통과| C[병합]",
  "  B -->|수정| A",
  "  C --> D((배포))",
  "```",
  "",
  "```ts",
  "export async function release(version: string) {",
  "  await run(`npm run version:set -- ${version}`);",
  "  return { tag: `v${version}`, ok: true };",
  "}",
  "```",
  "",
  "| 단계 | 담당 | 상태 |",
  "| --- | --- | --- |",
  "| 검토 | 팀 | 진행 중 |",
  "| 배포 | 자동 | 대기 |",
  "",
].join("\n");
// Set through the dev server's store module: typing would auto-indent.
await evaluate(`(async () => {
  const { useWorkspace } = await import("/src/workspace/store.ts");
  const text = ${JSON.stringify(doc)};
  useWorkspace.setState((state) => ({
    documents: state.documents.map((d) =>
      d.id === "getting-started" ? { ...d, content: text, savedContent: text } : d,
    ),
  }));
  return true;
})()`);
await sleep(3000);
await shot("screenshot-002.png");

// Project search with a regular expression.
log("search");
await click('[aria-label="검색"]');
await sleep(300);
await evaluate(`document.getElementById("document-search").focus(); true`);
await send("Input.insertText", { text: "문서\\S*" });
await key("r", "KeyR", 1, 82);
await sleep(800);
await shot("screenshot-003.png");

// Command palette.
log("palette");
await evaluate(
  `window.dispatchEvent(new KeyboardEvent("keydown", { key: "P", code: "KeyP", ctrlKey: true, shiftKey: true, bubbles: true })); true`,
);
await sleep(600);
await shot("screenshot-004.png");
await evaluate(
  `window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true })); true`,
);
await sleep(300);

// Settings.
log("settings");
await click('footer [aria-label="설정"]');
await sleep(800);
await shot("screenshot-005.png");

// Light theme.
await scheme("light");
await click('[aria-label="설정 탭 닫기"]').catch(() => {});
await evaluate(
  `(() => { const t = [...document.querySelectorAll('[role="tab"]')].find(b => b.textContent.includes("README")); t && t.click(); return true; })()`,
);
await click('[aria-label="탐색기"]');
await sleep(800);
await shot("screenshot-006.png");

ws.close();
edge.kill();
process.exit(0);
