import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";

function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), "oxidoc-version-"));
  mkdirSync(join(dir, "scripts"));
  mkdirSync(join(dir, "src-tauri"));
  copyFileSync(
    new URL("./version.mjs", import.meta.url),
    join(dir, "scripts/version.mjs"),
  );
  for (const [path, value] of Object.entries({
    "package.json": { name: "oxidoc", version: "0.1.0" },
    "package-lock.json": {
      version: "0.1.0",
      packages: { "": { version: "0.1.0" }, dependency: { version: "9.9.9" } },
    },
    "src-tauri/tauri.conf.json": { version: "0.1.0" },
  }))
    writeFileSync(join(dir, path), JSON.stringify(value));
  writeFileSync(
    join(dir, "src-tauri/Cargo.toml"),
    '[package]\nname = "oxidoc"\nversion = "0.1.0"\n',
  );
  writeFileSync(
    join(dir, "src-tauri/Cargo.lock"),
    '[[package]]\nname = "dependency"\nversion = "9.9.9"\n\n[[package]]\nname = "oxidoc"\nversion = "0.1.0"\n',
  );
  const cli = (...args) =>
    spawnSync(process.execPath, [join(dir, "scripts/version.mjs"), ...args], {
      encoding: "utf8",
    });
  try {
    run(dir, cli);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("version bump synchronizes manifests without changing dependencies", () =>
  fixture((dir, cli) => {
    assert.equal(cli("--check").status, 0);
    assert.equal(cli("0.2.0-beta.1").status, 0);
    assert.equal(cli("--check").status, 0);
    assert.equal(
      JSON.parse(readFileSync(join(dir, "package.json"))).version,
      "0.2.0-beta.1",
    );
    assert.equal(
      JSON.parse(readFileSync(join(dir, "package-lock.json"))).packages
        .dependency.version,
      "9.9.9",
    );
    assert.match(
      readFileSync(join(dir, "src-tauri/Cargo.lock"), "utf8"),
      /name = "dependency"\nversion = "9.9.9"/,
    );
  }));
test("invalid input and incomplete manifests do not partially rewrite versions", () =>
  fixture((dir, cli) => {
    assert.notEqual(cli("01.2.0").status, 0);
    assert.equal(
      JSON.parse(readFileSync(join(dir, "package.json"))).version,
      "0.1.0",
    );
    writeFileSync(join(dir, "src-tauri/Cargo.lock"), "");
    assert.notEqual(cli("0.2.0").status, 0);
    assert.equal(
      JSON.parse(readFileSync(join(dir, "package.json"))).version,
      "0.1.0",
    );
  }));
test("mismatched versions fail validation", () =>
  fixture((dir, cli) => {
    writeFileSync(
      join(dir, "src-tauri/tauri.conf.json"),
      '{"version":"0.9.0"}',
    );
    const result = cli("--check");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Version mismatch/);
  }));

test("missing package version never matches or rewrites a dependency version", () =>
  fixture((dir, cli) => {
    const cargo =
      '[package]\nname = "oxidoc"\n\n[dependencies.foo]\nversion = "0.1.0"\n';
    writeFileSync(join(dir, "src-tauri/Cargo.toml"), cargo);
    assert.notEqual(cli("--check").status, 0);
    assert.notEqual(cli("0.2.0").status, 0);
    assert.equal(
      readFileSync(join(dir, "src-tauri/Cargo.toml"), "utf8"),
      cargo,
    );
    assert.equal(
      JSON.parse(readFileSync(join(dir, "package.json"))).version,
      "0.1.0",
    );
  }));
