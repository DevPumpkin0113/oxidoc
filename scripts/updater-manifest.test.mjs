import { test } from "node:test";
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { createManifest } from "./updater-manifest.mjs";
const signature = Buffer.from(
  "untrusted comment: fixture signature\ntrusted comment: timestamp:0\tversion:0.3.0\n",
).toString("base64");
const artifacts = {
  nsis: { name: "Oxidoc_0.3.0_x64-setup.exe", signature },
  msi: { name: "Oxidoc_0.3.0_x64_en-US.msi", signature },
};
test("installer type and pinned repository release mapping", () => {
  const manifest = createManifest("0.3.0", artifacts, "notes");
  assert.equal(
    manifest.platforms["windows-x86_64-nsis"].url,
    "https://github.com/DevPumpkin0113/oxidoc/releases/download/v0.3.0/Oxidoc_0.3.0_x64-setup.exe",
  );
  assert.match(manifest.platforms["windows-x86_64-msi"].url, /\.msi$/);
  assert.equal(manifest.notes, "notes");
});
test("reject prereleases, mismatched artifacts and missing/invalid signatures", () => {
  assert.throws(() => createManifest("0.3.0-beta.1", artifacts));
  assert.throws(() => createManifest("0.4.0", artifacts));
  assert.throws(() => createManifest("0.3.0", { nsis: artifacts.nsis }));
  assert.throws(() =>
    createManifest("0.3.0", {
      ...artifacts,
      msi: { ...artifacts.msi, signature: "bad" },
    }),
  );
});
