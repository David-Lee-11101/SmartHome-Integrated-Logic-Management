import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {routeElectronSmoke} from "./electron-smoke-route.mjs";

const packageIndex = process.argv.indexOf("--package");
if (packageIndex < 0 || !process.argv[packageIndex + 1]) throw new Error("--package is required");
const packageRoot = path.resolve(process.argv[packageIndex + 1]);
const executable = process.platform === "darwin"
  ? path.join(packageRoot, "Electron.app", "Contents", "MacOS", "Electron")
  : path.join(packageRoot, process.platform === "win32" ? "electron.exe" : "electron");
if (!fs.existsSync(executable)) throw new Error("packaged native executable is missing");
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "smarthome-management-smoke-"));
const workspace = path.join(taskRoot, "workspace");
const report = path.join(taskRoot, "report.json");
fs.mkdirSync(workspace);
const appArguments = ["--self-check", "--offline", "--report", report, "--workspace", workspace];
const {command, args} = routeElectronSmoke(executable, appArguments);
const child = spawn(command, args, {stdio: ["ignore", "pipe", "pipe"], shell: false});
let stderr = "";
child.stderr.on("data", chunk => { if (stderr.length < 65536) stderr += String(chunk); });
const timeout = setTimeout(() => child.kill("SIGTERM"), 30000);
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", code => resolve(code));
});
clearTimeout(timeout);
if (exitCode !== 0 || !fs.existsSync(report)) throw new Error(`packaged smoke failed with ${String(exitCode)}: ${stderr.slice(-2000)}`);
const outputIndex = process.argv.indexOf("--report-output");
const finalReport = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : report;
if (finalReport !== report) fs.copyFileSync(report, finalReport, fs.constants.COPYFILE_EXCL);
process.stdout.write(JSON.stringify({report: finalReport, packageRoot}) + "\n");
