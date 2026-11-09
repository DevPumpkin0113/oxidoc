import { readFileSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { Buffer } from "node:buffer";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";

export function createManifest(version, artifacts, notes = "") {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw Error("Only stable release versions can be published.");
  const platforms = {};
  for (const type of ["nsis", "msi"]) {
    const artifact = artifacts[type];
    if (!artifact?.signature || !artifact.name)
      throw Error(`Missing signed ${type} artifact.`);
    const expected =
      type === "nsis"
        ? `Oxidoc_${version}_x64-setup.exe`
        : `Oxidoc_${version}_x64_en-US.msi`;
    if (artifact.name !== expected)
      throw Error(`Unexpected ${type} artifact version/name.`);
    // Reject an invalid signature envelope before publishing a broken feed.
    const envelope = Buffer.from(artifact.signature.trim(), "base64").toString(
      "utf8",
    );
    if (!envelope.startsWith("untrusted comment:"))
      throw Error(`Invalid ${type} signature envelope.`);
    const comment = envelope
      .split(/\r?\n/)
      .find((line) => line.startsWith("trusted comment:"));
    const signedVersion = comment
      ?.split("\t")
      .find((field) => field.startsWith("version:"))
      ?.slice(8);
    if (signedVersion !== version)
      throw Error(`Missing/mismatched ${type} signed version.`);
    platforms[`windows-x86_64-${type}`] = {
      signature: artifact.signature.trim(),
      url: `https://github.com/DevPumpkin0113/oxidoc/releases/download/v${version}/${encodeURIComponent(artifact.name)}`,
    };
  }
  return { version, notes, pub_date: new Date().toISOString(), platforms };
}

export function writeManifest(root) {
  const { version } = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const artifacts = {};
  const output = path.join(root, "output", "release");
  mkdirSync(output, { recursive: true });
  const checksums = [];
  for (const type of ["nsis", "msi"]) {
    const name =
      type === "nsis"
        ? `Oxidoc_${version}_x64-setup.exe`
        : `Oxidoc_${version}_x64_en-US.msi`;
    const source = path.join(
      root,
      "src-tauri",
      "target",
      "release",
      "bundle",
      type,
      name,
    );
    const bytes = readFileSync(source);
    const signature = readFileSync(`${source}.sig`, "utf8");
    artifacts[type] = { name, signature };
    copyFileSync(source, path.join(output, name));
    copyFileSync(`${source}.sig`, path.join(output, `${name}.sig`));
    checksums.push(
      `${createHash("sha256").update(bytes).digest("hex")}  ${name}`,
    );
  }
  const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const notes = (changelog.split(`## [${version}]`)[1] ?? "")
    .split(/\r?\n## /)[0]
    .replace(/^ - [^\r\n]*\r?\n/, "")
    .trim();
  const manifest = createManifest(version, artifacts, notes);
  writeFileSync(
    path.join(output, "latest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  writeFileSync(
    path.join(output, "SHA256SUMS.txt"),
    checksums.join("\n") + "\n",
  );
  return output;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.stdout.write(
    `Release files: ${writeManifest(fileURLToPath(new URL("../", import.meta.url)))}\n`,
  );
}
