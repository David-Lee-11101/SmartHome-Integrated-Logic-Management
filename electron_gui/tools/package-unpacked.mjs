import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.resolve(toolRoot, "..");
const repositoryRoot = path.resolve(applicationRoot, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(applicationRoot, "package.json"), "utf8"));
const electronPackage = JSON.parse(fs.readFileSync(path.join(applicationRoot, "node_modules/electron/package.json"), "utf8"));
if (electronPackage.version !== packageJson.devDependencies.electron) throw new Error("installed Electron does not match the lock");
const electronDist = path.join(applicationRoot, "node_modules/electron/dist");
if (!fs.existsSync(electronDist)) throw new Error("Electron runtime is absent; run the pinned network preparation step first");

const git = spawnSync("git", ["rev-parse", "HEAD"], {cwd: repositoryRoot, encoding: "utf8"});
if (git.status !== 0) throw new Error("cannot resolve exact repository head");
const head = git.stdout.trim();
if (!/^[0-9a-f]{40}$/.test(head)) throw new Error("invalid exact head");
const shortHead = head.slice(0, 12);
const outputArgument = process.argv.indexOf("--output");
const outputRoot = outputArgument >= 0
  ? path.resolve(process.argv[outputArgument + 1])
  : path.join(applicationRoot, "artifacts", `SmartHome-Integrated-Logic-Management-${process.platform}-${process.arch}-${shortHead}`);
if (fs.existsSync(outputRoot)) throw new Error("package output already exists");

function assertSafeSymlinks(root) {
  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    const current = path.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      const target = path.resolve(path.dirname(current), fs.readlinkSync(current));
      if (!(target === electronDist || target.startsWith(electronDist + path.sep))) throw new Error(`runtime symlink escapes distribution: ${entry.name}`);
    } else if (entry.isDirectory()) {
      assertSafeSymlinks(current);
    }
  }
}
assertSafeSymlinks(electronDist);
fs.cpSync(electronDist, outputRoot, {recursive: true, verbatimSymlinks: true});

const resourcesRoot = process.platform === "darwin"
  ? path.join(outputRoot, "Electron.app", "Contents", "Resources")
  : path.join(outputRoot, "resources");
if (!fs.existsSync(resourcesRoot)) throw new Error("Electron resources directory is missing for this host");
for (const defaultApp of ["default_app.asar", "default_app"]) {
  fs.rmSync(path.join(resourcesRoot, defaultApp), {recursive: true, force: true});
}
const packagedApp = path.join(resourcesRoot, "app");
fs.mkdirSync(packagedApp, {recursive: false});

const productionManifest = {
  name: packageJson.name,
  version: packageJson.version,
  description: packageJson.description,
  main: "./dist/main.js",
  author: packageJson.author,
  private: true,
  license: "UNLICENSED",
};
fs.writeFileSync(path.join(packagedApp, "package.json"), JSON.stringify(productionManifest, null, 2) + "\n");
fs.cpSync(path.join(applicationRoot, "dist"), path.join(packagedApp, "dist"), {recursive: true});
fs.cpSync(path.join(applicationRoot, "assets"), path.join(packagedApp, "assets"), {recursive: true});
fs.cpSync(path.join(repositoryRoot, "RIGHTS.md"), path.join(packagedApp, "RIGHTS.md"));
const generatorJar = path.join(repositoryRoot, "services", "code-generator", "target", "management-code-generator-1.0.0-SNAPSHOT.jar");
if (!fs.existsSync(generatorJar)) throw new Error("code-generator JAR is missing; build it before packaging");
fs.mkdirSync(path.join(packagedApp, "services", "code-generator"), {recursive: true});
fs.cpSync(generatorJar, path.join(packagedApp, "services", "code-generator", path.basename(generatorJar)));
fs.cpSync(path.join(repositoryRoot, "services", "code-generator", "PROVENANCE.json"), path.join(packagedApp, "services", "code-generator", "PROVENANCE.json"));
fs.writeFileSync(path.join(packagedApp, "build-info.json"), JSON.stringify({head, electron: electronPackage.version}, null, 2) + "\n");

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function inventory(root, base = root, result = []) {
  for (const entry of fs.readdirSync(root, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
    const current = path.join(root, entry.name);
    const relative = path.relative(base, current).split(path.sep).join("/");
    if (entry.isSymbolicLink()) result.push({path: relative, type: "symlink", target: fs.readlinkSync(current)});
    else if (entry.isDirectory()) inventory(current, base, result);
    else if (entry.isFile()) result.push({path: relative, type: "file", sha256: hashFile(current), size: fs.statSync(current).size});
  }
  return result;
}
const files = inventory(outputRoot);
const notices = files.filter(item => /(^|\/)(license|licenses|notice)(\.|\/|$)/i.test(item.path));
if (notices.length === 0) throw new Error("third-party runtime notices were not preserved");
const manifest = {schemaVersion: "1.0.0", component: packageJson.name, head, electron: electronPackage.version, platform: process.platform, arch: process.arch, files, noticePaths: notices.map(item => item.path)};
const manifestPath = path.join(outputRoot, "package-manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", {flag: "wx"});
process.stdout.write(JSON.stringify({outputRoot, manifestPath, manifestSha256: hashFile(manifestPath), fileCount: files.length, noticeCount: notices.length}) + "\n");
