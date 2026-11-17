import { test } from "node:test";
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createManifest, writeManifest } from "./updater-manifest.mjs";
const signature = Buffer.from(
  "untrusted comment: fixture signature\ntrusted comment: timestamp:0\tversion:0.3.0\n",
).toString("base64");
const artifacts = {
  nsis: { name: "Oxidoc_0.3.0_x64-setup.exe", signature },
};
test("installer type and pinned repository release mapping", () => {
  const manifest = createManifest("0.3.0", artifacts, "notes");
  assert.equal(
    manifest.platforms["windows-x86_64-nsis"].url,
    "https://github.com/DevPumpkin0113/oxidoc/releases/download/v0.3.0/Oxidoc_0.3.0_x64-setup.exe",
  );
  assert.deepEqual(Object.keys(manifest.platforms), ["windows-x86_64-nsis"]);
  assert.equal(manifest.notes, "notes");
});

test("release staging contains only EXE, signature and NSIS feed without MSI input", () => {
  const root = mkdtempSync(path.join(tmpdir(), "oxidoc-release-"));
  const name = artifacts.nsis.name;
  const bundle = path.join(
    root,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "nsis",
  );
  mkdirSync(bundle, { recursive: true });
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ version: "0.3.0" }),
  );
  writeFileSync(
    path.join(root, "CHANGELOG.md"),
    "## [0.3.0]\n\nRelease notes\n",
  );
  writeFileSync(path.join(bundle, name), "installer fixture");
  writeFileSync(path.join(bundle, `${name}.sig`), signature);
  const output = writeManifest(root);
  assert.deepEqual(
    readdirSync(output).sort(),
    [name, `${name}.sig`, "latest.json"].sort(),
  );
  const manifest = JSON.parse(
    readFileSync(path.join(output, "latest.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(manifest.platforms), ["windows-x86_64-nsis"]);
  assert.equal(
    readFileSync(path.join(output, name), "utf8"),
    "installer fixture",
  );
});
test("reject prereleases, mismatched artifacts and missing/invalid signatures", () => {
  assert.throws(() => createManifest("0.3.0-beta.1", artifacts));
  assert.throws(() => createManifest("0.4.0", artifacts));
  assert.throws(() => createManifest("0.3.0", {}));
  assert.throws(() =>
    createManifest("0.3.0", {
      ...artifacts,
      nsis: { ...artifacts.nsis, signature: "bad" },
    }),
  );
});
