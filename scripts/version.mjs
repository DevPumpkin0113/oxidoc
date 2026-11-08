import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import { log, error } from "node:console";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || (args[0] !== "--check" && !semver.test(args[0]))) {
    throw Error("Usage: npm run version:check | npm run version:set -- 0.1.1");
  }
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
  const cargo = read("src-tauri/Cargo.toml");
  const cargoLock = read("src-tauri/Cargo.lock");
  const cargoPattern =
    /(^\[package\]\r?\n(?:(?!^\[)[\s\S])*?^version\s*=\s*")([^"]+)(")/m;
  const lockPattern =
    /(^\[\[package\]\]\r?\nname = "oxidoc"\r?\nversion = ")([^"]+)(")/m;
  const cargoMatch = cargo.match(cargoPattern),
    lockMatch = cargoLock.match(lockPattern);
  if (!cargoMatch || !lockMatch || !lock.packages?.[""])
    throw Error("Required package version fields are missing.");
  const versions = {
    "package.json": pkg.version,
    "package-lock.json": lock.version,
    "package-lock.json packages[root]": lock.packages[""].version,
    "src-tauri/tauri.conf.json": tauri.version,
    "src-tauri/Cargo.toml": cargoMatch[2],
    "src-tauri/Cargo.lock": lockMatch[2],
  };
  if (args[0] === "--check") {
    if (!semver.test(pkg.version))
      throw Error("package.json does not contain a valid SemVer version.");
    const mismatches = Object.entries(versions).filter(
      ([, version]) => version !== pkg.version,
    );
    if (mismatches.length)
      throw Error(
        "Version mismatch: " +
          mismatches.map(([path, version]) => `${path}=${version}`).join(", "),
      );
    log(`All package versions match ${pkg.version}.`);
    return;
  }
  const version = args[0];
  pkg.version = version;
  lock.version = version;
  lock.packages[""].version = version;
  tauri.version = version;
  // Read and validate every manifest before writing any of them.
  const changes = new Map([
    ["package.json", JSON.stringify(pkg, null, 2) + "\n"],
    ["package-lock.json", JSON.stringify(lock, null, 2) + "\n"],
    ["src-tauri/tauri.conf.json", JSON.stringify(tauri, null, 2) + "\n"],
    [
      "src-tauri/Cargo.toml",
      cargo.replace(
        cargoPattern,
        (_, before, _old, after) => before + version + after,
      ),
    ],
    [
      "src-tauri/Cargo.lock",
      cargoLock.replace(
        lockPattern,
        (_, before, _old, after) => before + version + after,
      ),
    ],
  ]);
  for (const [path, contents] of changes)
    writeFileSync(fileURLToPath(new URL(path, root)), contents);
  log(`Updated all package versions to ${version}.`);
}
try {
  main();
} catch (failure) {
  error(failure.message);
  process.exitCode = 1;
}
