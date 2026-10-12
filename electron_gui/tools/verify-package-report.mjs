import fs from "node:fs";
import path from "node:path";

const reportIndex = process.argv.indexOf("--report");
if (reportIndex < 0 || !process.argv[reportIndex + 1]) throw new Error("--report is required");
const report = JSON.parse(fs.readFileSync(path.resolve(process.argv[reportIndex + 1]), "utf8"));
const modeIndex = process.argv.indexOf("--mode");
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : "packaged";
if (mode !== "packaged" && mode !== "native") throw new Error("--mode must be packaged or native");
const expectedFields = {status: "ready", didFinishLoad: true, preloadIpcReady: true, rendererSandboxed: true, contextIsolation: true, offline: true, externalAdaptersEnabled: false, workspaceState: "empty", packaged: mode === "packaged", resourcesPathVerified: mode === "packaged"};
if (mode === "packaged") expectedFields.packagedAppPathVerified = true;
for (const [field, expected] of Object.entries(expectedFields)) {
  if (report[field] !== expected) throw new Error(`self-check field ${field} did not match the required value`);
}
if (!/^[0-9a-f]{40}$/.test(report.head)) throw new Error("self-check did not report an exact head");
if (report.platform !== process.platform || report.arch !== process.arch) throw new Error("self-check host identity mismatch");
process.stdout.write(JSON.stringify({status: "verified", mode, head: report.head, electron: report.electron, platform: report.platform, arch: report.arch}) + "\n");
