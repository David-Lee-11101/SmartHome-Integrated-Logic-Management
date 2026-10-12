import {app, BrowserWindow, ipcMain, IpcMainEvent, IpcMainInvokeEvent, session} from "electron";
import {spawn} from "child_process";
import fs = require("fs");
import path = require("path");
import {pathToFileURL} from "url";
import {
  CatalogItem,
  isTrustedIpcSender,
  loadCatalogModule,
  ModuleEntry,
  readCatalog,
  requireAccount,
  requireCatalogModuleId,
  requireModuleEntry,
} from "./json_loader";
import {generateBuildStartInvoke} from "./generator_bridge";
import {readEvidenceSnapshot} from "./evidence_store";

interface DeviceInfo {
  label: string;
  selectedValue: string;
}

interface PythonArgs {
  rule_name: string;
  trigger_device: string;
  trigger_condition: string;
  trigger_DAC: string;
  trigger_device_info: DeviceInfo[];
  query_device: string;
  query_content: string;
  query_DAC: string;
  query_device_info: DeviceInfo[];
  action_device: string;
  action_execution: string;
  action_DAC: string;
  action_device_info: DeviceInfo[];
  filter_code: string;
  is_pro: boolean;
  priority: string;
}

type SelectionKind = "trigger" | "query" | "action";
type IpcEvent = IpcMainEvent | IpcMainInvokeEvent;

const applicationRoot = app.getAppPath();
const repositoryRoot = path.resolve(applicationRoot, "..");
const commandLine = process.argv.slice(1);

function argumentValue(name: string): string | undefined {
  const index = commandLine.indexOf(name);
  return index >= 0 ? commandLine[index + 1] : undefined;
}

const selfCheck = commandLine.includes("--self-check");
const offline = commandLine.includes("--offline");
const externalAdaptersEnabled = process.env.SMART_HOME_EXTERNAL_ADAPTERS_ENABLED === "true";
const workspaceArgument = argumentValue("--workspace");
const workspaceRoot = workspaceArgument
  ? path.resolve(workspaceArgument)
  : path.join(app.getPath("userData"), "workspace");
const electronDataRoot = path.join(workspaceRoot, "catalog");
const moduleRoots: Record<SelectionKind, string> = {
  trigger: path.join(electronDataRoot, "trigger"),
  query: path.join(electronDataRoot, "query"),
  action: path.join(electronDataRoot, "action"),
};
const indexHtmlPath = path.join(applicationRoot, "assets", "index.html");
const trustedRendererUrl = pathToFileURL(indexHtmlPath).toString();

let win: BrowserWindow | undefined;
let triggerDevices: CatalogItem[] = [];
let queryDevices: CatalogItem[] = [];
let actionDevices: CatalogItem[] = [];

function catalogFor(kind: SelectionKind): CatalogItem[] {
  if (kind === "trigger") {
    return triggerDevices;
  }
  if (kind === "query") {
    return queryDevices;
  }
  return actionDevices;
}

function requireString(value: unknown, field: string, maximumLength = 4096): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximumLength) {
    throw new Error(`${field} must be a non-empty string of at most ${maximumLength} characters`);
  }
  return value;
}

function requireBoundedString(value: unknown, field: string, maximumLength: number): string {
  if (typeof value !== "string" || value.length > maximumLength) {
    throw new Error(`${field} must be a string of at most ${maximumLength} characters`);
  }
  return value;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireDeviceInfo(value: unknown, field: string): DeviceInfo[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new Error(`${field} must be an array with at most 100 entries`);
  }
  return value.map((item, index) => {
    const record = requireRecord(item, `${field}[${index}]`);
    return {
      label: requireString(record.label, `${field}[${index}].label`, 256),
      selectedValue: requireString(record.selectedValue, `${field}[${index}].selectedValue`, 4096),
    };
  });
}

function selectionFrom(
  value: Record<string, unknown>,
  kind: SelectionKind,
): {entries: ModuleEntry[]; entry: ModuleEntry} {
  const operationField = kind === "trigger"
    ? "trigger_condition"
    : kind === "query"
      ? "query_content"
      : "action_execution";
  const accountField = `${kind}_DAC`;
  const deviceId = requireString(value[`${kind}_device`], `${kind}_device`, 256);
  const operationId = requireString(value[operationField], operationField, 256);
  const accountId = requireString(value[accountField], accountField, 256);
  const entries = loadCatalogModule(moduleRoots[kind], catalogFor(kind), deviceId);
  const entry = requireModuleEntry(entries, operationId);
  requireAccount(entry, accountId);
  return {entries, entry};
}

function validatePythonArgs(value: unknown): PythonArgs {
  const record = requireRecord(value, "composer request");
  selectionFrom(record, "trigger");
  selectionFrom(record, "query");
  selectionFrom(record, "action");
  if (typeof record.is_pro !== "boolean") {
    throw new Error("is_pro must be a boolean");
  }
  return {
    rule_name: requireString(record.rule_name, "rule_name", 256),
    trigger_device: requireString(record.trigger_device, "trigger_device", 256),
    trigger_condition: requireString(record.trigger_condition, "trigger_condition", 256),
    trigger_DAC: requireString(record.trigger_DAC, "trigger_DAC", 256),
    trigger_device_info: requireDeviceInfo(record.trigger_device_info, "trigger_device_info"),
    query_device: requireString(record.query_device, "query_device", 256),
    query_content: requireString(record.query_content, "query_content", 256),
    query_DAC: requireString(record.query_DAC, "query_DAC", 256),
    query_device_info: requireDeviceInfo(record.query_device_info, "query_device_info"),
    action_device: requireString(record.action_device, "action_device", 256),
    action_execution: requireString(record.action_execution, "action_execution", 256),
    action_DAC: requireString(record.action_DAC, "action_DAC", 256),
    action_device_info: requireDeviceInfo(record.action_device_info, "action_device_info"),
    filter_code: requireBoundedString(record.filter_code, "filter_code", 100_000),
    is_pro: record.is_pro,
    priority: requireString(record.priority, "priority", 32),
  };
}

function runPythonScript(args: PythonArgs): void {
  if (!externalAdaptersEnabled) {
    throw new Error("external adapters are disabled; enable them explicitly after reviewing configuration");
  }
  const spiderPath = path.join(repositoryRoot, "applet_executor", "ifttt_rule_creator.py");
  const commandArgs = [
    "runspider",
    "-a", `trigger_device=${args.trigger_device}`,
    "-a", `trigger_condition=${args.trigger_condition}`,
    "-a", `trigger_DAC=${args.trigger_DAC}`,
    "-a", `trigger_device_info=${JSON.stringify(args.trigger_device_info)}`,
    "-a", `query_device=${args.query_device}`,
    "-a", `query_content=${args.query_content}`,
    "-a", `query_DAC=${args.query_DAC}`,
    "-a", `query_device_info=${JSON.stringify(args.query_device_info)}`,
    "-a", `action_device=${args.action_device}`,
    "-a", `action_execution=${args.action_execution}`,
    "-a", `action_DAC=${args.action_DAC}`,
    "-a", `action_device_info=${JSON.stringify(args.action_device_info)}`,
    "-a", `is_pro=${String(args.is_pro)}`,
    "-a", `priority=${args.priority}`,
    "-a", `rule_name=${args.rule_name}`,
    "-a", `filter_code=${args.filter_code}`,
    spiderPath,
  ];
  const child = spawn("scrapy", commandArgs, {cwd: repositoryRoot});
  child.stdout.resume();
  child.stderr.resume();
  child.on("error", () => console.error("External adapter failed to start."));
  child.on("close", (code) => console.log(`External adapter exited with status ${String(code)}.`));
}

function ownedWindow(): BrowserWindow {
  if (!win || win.isDestroyed()) {
    throw new Error("composer window is not available");
  }
  return win;
}

function assertTrustedEvent(event: IpcEvent): void {
  const window = ownedWindow();
  if (!isTrustedIpcSender(event.sender, event.senderFrame?.url, window.webContents, trustedRendererUrl)) {
    throw new Error("untrusted IPC sender");
  }
}

function trustedOn(channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => void): void {
  ipcMain.on(channel, (event, ...args) => {
    try {
      assertTrustedEvent(event);
      listener(event, ...args);
    } catch {
      console.warn(`Rejected invalid IPC request on ${channel}.`);
    }
  });
}

function trustedHandle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>): void {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedEvent(event);
    return listener(event, ...args);
  });
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function moduleSelection(
  kind: SelectionKind,
  moduleIdValue: unknown,
  operationIdValue: unknown,
  accountIdValue: unknown,
): ModuleEntry[] {
  const moduleId = requireString(moduleIdValue, `${kind} module id`, 256);
  const operationId = requireString(operationIdValue, `${kind} operation id`, 256);
  const accountId = requireString(accountIdValue, `${kind} account id`, 256);
  const entries = loadCatalogModule(moduleRoots[kind], catalogFor(kind), moduleId);
  const entry = requireModuleEntry(entries, operationId);
  requireAccount(entry, accountId);
  return entries;
}

function loadCatalogs(): void {
  if (!fs.existsSync(electronDataRoot)) {
    triggerDevices = [];
    queryDevices = [];
    actionDevices = [];
    return;
  }
  triggerDevices = readCatalog(electronDataRoot, "trigger_device_names.json");
  queryDevices = readCatalog(electronDataRoot, "query_device_names.json");
  actionDevices = readCatalog(electronDataRoot, "action_device_names.json");
}

let preloadReady = false;
let rendererSandboxed = false;
let rendererContextIsolated = false;
let windowLoaded = false;

function writeSelfCheckReport(): void {
  if (!selfCheck || !preloadReady || !windowLoaded) return;
  if (!offline) throw new Error("self-check requires --offline");
  const reportPath = argumentValue("--report");
  if (!reportPath) throw new Error("self-check requires --report");
  fs.mkdirSync(workspaceRoot, {recursive: true});
  const workspaceEntries = fs.readdirSync(workspaceRoot);
  const buildInfoPath = path.join(applicationRoot, "build-info.json");
  const buildInfo = fs.existsSync(buildInfoPath)
    ? JSON.parse(fs.readFileSync(buildInfoPath, "utf8")) as Record<string, unknown>
    : {head: process.env.MANAGEMENT_EXACT_HEAD ?? "development"};
  const normalizedAppPath = applicationRoot.split(path.sep).join("/");
  const normalizedResources = process.resourcesPath.split(path.sep).join("/");
  const packagedStructure = normalizedAppPath.endsWith("/resources/app") || normalizedAppPath.endsWith("/Resources/app");
  const report = {
    schemaVersion: "1.0.0",
    status: "ready",
    didFinishLoad: true,
    preloadIpcReady: true,
    rendererSandboxed,
    contextIsolation: rendererContextIsolated,
    offline: true,
    externalAdaptersEnabled,
    workspaceState: workspaceEntries.length === 0 ? "empty" : "non-empty",
    packaged: packagedStructure,
    electronPackagedFlag: app.isPackaged,
    packagedAppPathVerified: packagedStructure,
    resourcesPathVerified: normalizedAppPath.startsWith(normalizedResources),
    head: String(buildInfo.head),
    electron: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
  };
  fs.writeFileSync(path.resolve(reportPath), JSON.stringify(report, null, 2) + "\n", {encoding: "utf8", flag: "wx"});
  setImmediate(() => app.quit());
}

ipcMain.on("management:preload-ready", (event, sandboxed: unknown, contextIsolated: unknown) => {
  if (!win || event.sender !== win.webContents) return;
  if (sandboxed !== true || contextIsolated !== true) throw new Error("renderer sandbox was not enabled");
  rendererSandboxed = true;
  rendererContextIsolated = true;
  preloadReady = true;
  writeSelfCheckReport();
});

function createWindow(): void {
  fs.mkdirSync(workspaceRoot, {recursive: true});
  loadCatalogs();
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "renderer.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({action: "deny"}));
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== trustedRendererUrl) {
      event.preventDefault();
    }
  });
  win.webContents.on("did-finish-load", () => {
    windowLoaded = true;
    writeSelfCheckReport();
  });
  void win.loadFile(indexHtmlPath);
}

app.whenReady().then(() => {
  if (offline) {
    session.defaultSession.webRequest.onBeforeRequest({urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"]},
      (_details, callback) => callback({cancel: true}));
  }
  createWindow();
});

trustedOn("load_filter_code_option", (_event, value) => {
  const record = requireRecord(value, "filter option request");
  const trigger = selectionFrom(record, "trigger").entry;
  const query = selectionFrom(record, "query").entry;
  const action = selectionFrom(record, "action").entry;
  ownedWindow().webContents.send(
    "update_filter_trigger_ingredient",
    (trigger.ingredients ?? []).map((item) => item.normalized_name),
  );
  ownedWindow().webContents.send(
    "update_filter_query_ingredients",
    (query.ingredients ?? []).map((item) => item.normalized_name),
  );
  ownedWindow().webContents.send(
    "update_filter_action_options",
    [`${toCamelCase(action.module_name)}.skip()`],
  );
});

trustedOn("start_button_click", (_event, value) => runPythonScript(validatePythonArgs(value)));

trustedOn("refresh_button_click", () => {
  const window = ownedWindow();
  window.webContents.send("load_trigger_devices", triggerDevices);
  window.webContents.send("load_query_devices", queryDevices);
  window.webContents.send("load_action_devices", actionDevices);
});

trustedOn("trigger_device_change", (_event, displayName) => {
  const moduleId = requireCatalogModuleId(triggerDevices, requireString(displayName, "trigger display name", 256));
  ownedWindow().webContents.send("update-trigger-condition", loadCatalogModule(moduleRoots.trigger, triggerDevices, moduleId));
});

trustedOn("query_device_change", (_event, displayName) => {
  const moduleId = requireCatalogModuleId(queryDevices, requireString(displayName, "query display name", 256));
  ownedWindow().webContents.send("update-query-content", loadCatalogModule(moduleRoots.query, queryDevices, moduleId));
});

trustedOn("action_device_change", (_event, displayName) => {
  const moduleId = requireCatalogModuleId(actionDevices, requireString(displayName, "action display name", 256));
  ownedWindow().webContents.send("update-action-execution", loadCatalogModule(moduleRoots.action, actionDevices, moduleId));
});

for (const [channel, kind, response] of [
  ["trigger_condition_change", "trigger", "update-trigger-device-info"],
  ["trigger_DAC_change", "trigger", "update-trigger-device-info"],
  ["query_content_change", "query", "update-query-device-info"],
  ["query_DAC_change", "query", "update-query-device-info"],
  ["action_execution_change", "action", "update-action-device-info"],
  ["action_DAC_change", "action", "update-action-device-info"],
] as const) {
  trustedOn(channel, (_event, moduleId, operationId, accountId) => {
    const entries = moduleSelection(kind, moduleId, operationId, accountId);
    ownedWindow().webContents.send(response, entries, operationId, accountId);
  });
}

trustedHandle("getEditorContent", async (event) => {
  const result = await event.sender.executeJavaScript("window.getEditorContent()", true);
  return String(result);
});

trustedHandle("management:generate-service", async (_event, request) => {
  if (selfCheck) throw new Error("generation is disabled during self-check");
  return generateBuildStartInvoke(applicationRoot, workspaceRoot, request);
});

trustedHandle("management:evidence-snapshot", async () => readEvidenceSnapshot(workspaceRoot));
