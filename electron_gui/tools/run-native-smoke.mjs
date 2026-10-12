import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawn, spawnSync} from "node:child_process";
import {routeElectronSmoke} from "./electron-smoke-route.mjs";

const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electron = process.platform === "darwin"
  ? path.join(applicationRoot, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron")
  : path.join(applicationRoot, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
if (!fs.existsSync(electron)) throw new Error("native Electron runtime is missing");
const outputIndex = process.argv.indexOf("--report-output");
if (outputIndex < 0 || !process.argv[outputIndex + 1]) throw new Error("--report-output is required");
const report = path.resolve(process.argv[outputIndex + 1]);
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "smarthome-management-native-"));
const workspace = path.join(taskRoot, "workspace");
fs.mkdirSync(workspace);
const appArguments = [applicationRoot, "--self-check", "--offline", "--report", report, "--workspace", workspace];
const {command, args} = routeElectronSmoke(electron, appArguments);
const git = spawnSync("git", ["rev-parse", "HEAD"], {cwd: path.resolve(applicationRoot, ".."), encoding: "utf8"});
if (git.status !== 0 || !/^[0-9a-f]{40}$/.test(git.stdout.trim())) throw new Error("cannot resolve exact repository head");
const child = spawn(command, args, {stdio: ["ignore", "pipe", "pipe"], shell: false, env: {...process.env, MANAGEMENT_EXACT_HEAD: git.stdout.trim()}});
let stderr = "";
child.stderr.on("data", chunk => { if (stderr.length < 65536) stderr += String(chunk); });
const timeout = setTimeout(() => child.kill("SIGTERM"), 30000);
const exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
clearTimeout(timeout);
if (exitCode !== 0 || !fs.existsSync(report)) throw new Error(`native smoke failed with ${String(exitCode)}: ${stderr.slice(-2000)}`);
process.stdout.write(JSON.stringify({report, status: "ready"}) + "\n");
