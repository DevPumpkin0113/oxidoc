import { existsSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { writeManifest } from "./updater-manifest.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const localKey = path.join(root, ".local", "keys", "oxidoc-updater.key");
const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY && existsSync(localKey))
  env.TAURI_SIGNING_PRIVATE_KEY = localKey;
if (!env.TAURI_SIGNING_PRIVATE_KEY)
  throw Error(
    "Provide TAURI_SIGNING_PRIVATE_KEY or .local/keys/oxidoc-updater.key; never commit the private key.",
  );
env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= "";
const result = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js"),
    "build",
    "--bundles",
    "nsis,msi",
  ],
  { cwd: root, env, stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
process.stdout.write(`Signed release files: ${writeManifest(root)}\n`);
