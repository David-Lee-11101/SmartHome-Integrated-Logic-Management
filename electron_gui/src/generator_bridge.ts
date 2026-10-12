import {ChildProcessWithoutNullStreams, spawn} from "child_process";
import fs = require("fs");
import path = require("path");

interface LocalServiceIdentity {
  projectName: string;
  serviceId: string;
  packageName: string;
  className: string;
}

export interface ConstantServiceRequest extends LocalServiceIdentity {
  behavior: "CONSTANT_V1";
  operation: string;
  valueType: "BOOLEAN" | "INT" | "LONG" | "DOUBLE" | "STRING";
  value: string;
}

export interface StatefulBooleanDeviceRequest extends LocalServiceIdentity {
  behavior: "STATEFUL_BOOLEAN_DEVICE_V1";
}

export type LocalServiceRequest = ConstantServiceRequest | StatefulBooleanDeviceRequest;

export interface LocalPipelineResult {
  generationManifest: Record<string, unknown>;
  provider: Record<string, unknown>;
  invocation: Record<string, unknown>;
  statefulProof?: Record<string, unknown>;
  catalogId: "local.catalog";
}

const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const projectName = /^[a-z][a-z0-9-]{0,62}$/;
const serviceId = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const packageName = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const className = /^[A-Z][A-Za-z0-9]{0,63}$/;
const valueTypes = new Set(["BOOLEAN", "INT", "LONG", "DOUBLE", "STRING"]);

function bounded(value: unknown, field: string, maximum: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || (pattern && !pattern.test(value))) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

export function validateLocalServiceRequest(value: unknown): LocalServiceRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("service request must be an object");
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const legacy = ["className", "operation", "packageName", "projectName", "serviceId", "value", "valueType"].sort();
  const behavior = record.behavior === undefined && keys.join("\n") === legacy.join("\n")
    ? "CONSTANT_V1"
    : bounded(record.behavior, "behavior", 40);
  const identity = {
    projectName: bounded(record.projectName, "projectName", 63, projectName),
    serviceId: bounded(record.serviceId, "serviceId", 128, serviceId),
    packageName: bounded(record.packageName, "packageName", 160, packageName),
    className: bounded(record.className, "className", 64, className),
  };
  if (behavior === "STATEFUL_BOOLEAN_DEVICE_V1") {
    const expected = ["behavior", "className", "packageName", "projectName", "serviceId"].sort();
    if (keys.join("\n") !== expected.join("\n")) throw new Error("stateful service request contains unknown or missing fields");
    return {...identity, behavior};
  }
  if (behavior !== "CONSTANT_V1") throw new Error("behavior is unsupported");
  const expected = record.behavior === undefined ? legacy : [...legacy, "behavior"].sort();
  if (keys.join("\n") !== expected.join("\n")) throw new Error("constant service request contains unknown or missing fields");
  const type = bounded(record.valueType, "valueType", 16);
  if (!valueTypes.has(type)) throw new Error("valueType is unsupported");
  return {
    ...identity,
    behavior,
    operation: bounded(record.operation, "operation", 64, identifier),
    valueType: type as ConstantServiceRequest["valueType"],
    value: bounded(record.value, "value", 4096),
  };
}

function runBounded(command: string, args: string[], cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd, shell: false, env: process.env});
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let timedOut = false;
    const maximumOutput = 1024 * 1024;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
    }, timeoutMs);
    let forceTimer: NodeJS.Timeout | undefined;
    const append = (target: "stdout" | "stderr", chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maximumOutput) {
        child.kill("SIGTERM");
        return;
      }
      if (target === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    };
    child.stdout.on("data", chunk => append("stdout", chunk));
    child.stderr.on("data", chunk => append("stderr", chunk));
    child.once("error", error => {
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      reject(error);
    });
    child.once("exit", code => {
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      if (timedOut) reject(new Error(`subprocess exceeded its ${timeoutMs} ms deadline`));
      else if (outputBytes > maximumOutput) reject(new Error("subprocess output exceeded one MiB"));
      else if (code !== 0) reject(new Error(`subprocess failed (${String(code)}): ${stderr.slice(-4000)}`));
      else resolve(stdout.trim());
    });
  });
}

function parseSingleJsonLine(output: string, event: string): Record<string, unknown> {
  const lines = output.split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) throw new Error(`expected one ${event} JSON line`);
  const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
  if (parsed.event !== event) throw new Error(`expected ${event}`);
  return parsed;
}

function typedScalar(result: Record<string, unknown>, expectedType: "boolean" | "integer"): unknown {
  if (result.status !== "success" || typeof result.value !== "object" || result.value === null || Array.isArray(result.value)) {
    throw new Error("invocation did not return a typed scalar");
  }
  const value = result.value as Record<string, unknown>;
  if (Object.keys(value).sort().join("\n") !== ["type", "value"].sort().join("\n") || value.type !== expectedType) {
    throw new Error(`invocation did not return ${expectedType}`);
  }
  return value.value;
}

function waitForProvider(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("generated provider startup timed out"));
    }, timeoutMs);
    child.stdout.on("data", chunk => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 65536) {
        clearTimeout(timer); child.kill("SIGTERM"); reject(new Error("provider startup output exceeded 64 KiB")); return;
      }
      const newline = stdout.indexOf("\n");
      if (newline >= 0) {
        clearTimeout(timer);
        try { resolve(parseSingleJsonLine(stdout.slice(0, newline).trim(), "provider-ready")); }
        catch (error) { child.kill("SIGTERM"); reject(error); }
      }
    });
    child.stderr.on("data", chunk => { if (stderr.length < 65536) stderr += chunk.toString("utf8"); });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`provider exited before ready (${String(code)}): ${stderr}`)); });
  });
}

function terminateBounded(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    let complete = false;
    let forceTimer: NodeJS.Timeout | undefined;
    let boundTimer: NodeJS.Timeout | undefined;
    const finish = () => {
      if (complete) return;
      complete = true;
      if (forceTimer) clearTimeout(forceTimer);
      if (boundTimer) clearTimeout(boundTimer);
      resolve();
    };
    child.once("exit", finish);
    child.kill("SIGTERM");
    forceTimer = setTimeout(() => child.kill("SIGKILL"), Math.max(1, Math.floor(timeoutMs / 2)));
    boundTimer = setTimeout(finish, timeoutMs);
  });
}

function writeCatalog(workspaceRoot: string, provider: Record<string, unknown>, request: LocalServiceRequest): void {
  const catalogRoot = path.join(workspaceRoot, "catalog");
  fs.mkdirSync(catalogRoot, {recursive: true});
  const catalogPath = path.join(catalogRoot, "local-catalog.json");
  const temporary = path.join(catalogRoot, `.local-catalog-${process.pid}-${Date.now()}.tmp`);
  const operations = request.behavior === "STATEFUL_BOOLEAN_DEVICE_V1"
    ? ["setEnabled", "readEnabled", "readActionCount"]
    : [request.operation];
  const catalog = {schemaVersion: "1.0.2", catalogId: "local.catalog", services: operations.map(operation => ({serviceId: request.serviceId, operation, host: provider.host, port: provider.port, transport: "tiny-rpc-netty"}))};
  fs.writeFileSync(temporary, JSON.stringify(catalog, null, 2) + "\n", {flag: "wx"});
  fs.renameSync(temporary, catalogPath);
}

export async function startGeneratedService(applicationRoot: string, workspaceRoot: string, unsafeRequest: unknown) {
  const request = validateLocalServiceRequest(unsafeRequest);
  const java = process.env.MANAGEMENT_JAVA ?? "java";
  const maven = process.env.MANAGEMENT_MAVEN ?? "mvn";
  const settings = process.env.MANAGEMENT_MAVEN_SETTINGS;
  const localRepository = process.env.MANAGEMENT_MAVEN_REPOSITORY;
  if (!settings || !localRepository) throw new Error("MANAGEMENT_MAVEN_SETTINGS and MANAGEMENT_MAVEN_REPOSITORY are required");
  const packagedGenerator = path.join(applicationRoot, "services", "code-generator", "management-code-generator-1.0.0-SNAPSHOT.jar");
  const developmentGenerator = path.join(applicationRoot, "..", "services", "code-generator", "target", "management-code-generator-1.0.0-SNAPSHOT.jar");
  const generatorJar = fs.existsSync(packagedGenerator) ? packagedGenerator : developmentGenerator;
  if (!fs.existsSync(generatorJar) || !fs.statSync(generatorJar).isFile()) throw new Error("packaged code generator is missing");
  const outputRoot = path.join(workspaceRoot, "generated-services");
  fs.mkdirSync(outputRoot, {recursive: true});
  const generatorArguments = request.behavior === "STATEFUL_BOOLEAN_DEVICE_V1"
    ? [request.behavior, outputRoot, request.projectName, request.serviceId, request.packageName, request.className]
    : [request.behavior, outputRoot, request.projectName, request.serviceId, request.packageName, request.className, request.operation, request.valueType, request.value];
  const generationOutput = await runBounded(java, ["-cp", generatorJar, "io.github.davidlee.smarthome.generator.GeneratorCli", ...generatorArguments], workspaceRoot, 15000);
  const generationManifest = JSON.parse(generationOutput) as Record<string, unknown>;
  const projectRoot = path.join(outputRoot, request.projectName);
  const mavenArgs = ["-s", path.resolve(settings), `-Dmaven.repo.local=${path.resolve(localRepository)}`, "package"];
  if (process.platform === "win32") {
    // Maven's Windows launcher is a batch file, not a native executable. Invoke
    // its installed Java launcher directly so renderer values never reach a shell.
    const mavenHome = process.env.MANAGEMENT_MAVEN_HOME;
    if (!mavenHome) throw new Error("MANAGEMENT_MAVEN_HOME is required on Windows");
    const home = path.resolve(mavenHome);
    const boot = path.join(home, "boot");
    const launchers = fs.readdirSync(boot).filter(file => /^plexus-classworlds-[\w.-]+\.jar$/.test(file));
    if (launchers.length !== 1) throw new Error("Maven Java launcher is missing or ambiguous");
    await runBounded(java, ["-cp", path.join(boot, launchers[0]), `-Dmaven.home=${home}`,
      `-Dclassworlds.conf=${path.join(home, "bin", "m2.conf")}`,
      `-Dmaven.multiModuleProjectDirectory=${projectRoot}`, "org.codehaus.plexus.classworlds.launcher.Launcher",
      ...mavenArgs], projectRoot, 180000);
  } else {
    await runBounded(maven, mavenArgs, projectRoot, 180000);
  }
  const classpath = [path.join(projectRoot, "target", "classes"), path.join(projectRoot, "target", "dependency", "*")].join(path.delimiter);
  const mainClass = `${request.packageName}.${request.className}`;
  const providerProcess = spawn(java, ["-cp", classpath, mainClass, "0"], {cwd: projectRoot, shell: false, env: process.env});
  try {
    const provider = await waitForProvider(providerProcess, 15000);
    if (provider.host !== "127.0.0.1" || !Number.isInteger(provider.port) || Number(provider.port) <= 0) throw new Error("provider announced an invalid endpoint");
    writeCatalog(workspaceRoot, provider, request);
    const invoke = async (operation: string, argumentsJson = "[]") => parseSingleJsonLine(
      await runBounded(java, ["-cp", classpath, "io.smarthome.logic.tinyrpc.TinyRpcLogicCli", "invoke", "127.0.0.1", String(provider.port), request.serviceId, operation, argumentsJson], projectRoot, 15000),
      "invocation-result");
    return {generationManifest, provider, catalogId: "local.catalog" as const, invoke,
      close: () => terminateBounded(providerProcess, 5000)};
  } catch (error) {
    await terminateBounded(providerProcess, 5000);
    throw error;
  }
}

export async function generateBuildStartInvoke(applicationRoot: string, workspaceRoot: string, unsafeRequest: unknown): Promise<LocalPipelineResult> {
  const request = validateLocalServiceRequest(unsafeRequest);
  const session = await startGeneratedService(applicationRoot, workspaceRoot, request);
  const {generationManifest, provider, invoke} = session;
  try {
    if (request.behavior === "STATEFUL_BOOLEAN_DEVICE_V1") {
      const initialEnabled = await invoke("readEnabled");
      const initialCount = await invoke("readActionCount");
      const firstMutation = await invoke("setEnabled");
      const enabledAfterMutation = await invoke("readEnabled");
      const countAfterMutation = await invoke("readActionCount");
      const secondMutation = await invoke("setEnabled");
      const concurrentMutations = await Promise.all(Array.from({length: 8}, () => invoke("setEnabled")));
      const countAfterConcurrentMutations = await invoke("readActionCount");
      const invalidArguments = await invoke("setEnabled", '[{"type":"boolean","value":true}]');
      const unknownOperation = await invoke("unknownOperation");
      const finalCount = await invoke("readActionCount");
      const successful = [initialEnabled, initialCount, firstMutation, enabledAfterMutation, countAfterMutation,
        secondMutation, countAfterConcurrentMutations, finalCount].every(result => result.status === "success")
        && concurrentMutations.every(result => result.status === "success");
      if (!successful || invalidArguments.status === "success" || unknownOperation.status === "success") {
        throw new Error("stateful TinyRPC proof did not satisfy its success and rejection contract");
      }
      if (typedScalar(initialEnabled, "boolean") !== false || typedScalar(initialCount, "integer") !== 0
          || typedScalar(firstMutation, "boolean") !== true || typedScalar(enabledAfterMutation, "boolean") !== true
          || typedScalar(countAfterMutation, "integer") !== 1 || typedScalar(secondMutation, "boolean") !== true
          || concurrentMutations.some(result => typedScalar(result, "boolean") !== true)
          || typedScalar(countAfterConcurrentMutations, "integer") !== 10 || typedScalar(finalCount, "integer") !== 10) {
        throw new Error("stateful TinyRPC proof returned an unexpected state or action count");
      }
      const statefulProof = {initialEnabled, initialCount, firstMutation, enabledAfterMutation, countAfterMutation,
        secondMutation, concurrentMutations, countAfterConcurrentMutations, invalidArguments, unknownOperation, finalCount};
      return {generationManifest, provider, invocation: firstMutation, statefulProof, catalogId: "local.catalog"};
    }
    const invocation = await invoke(request.operation);
    if (invocation.status !== "success") throw new Error("Logic Engine invocation did not succeed");
    return {generationManifest, provider, invocation, catalogId: "local.catalog"};
  } finally {
    await session.close();
  }
}
