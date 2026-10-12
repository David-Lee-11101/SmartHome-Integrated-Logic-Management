import {ChildProcessWithoutNullStreams, spawn} from "child_process";
import fs = require("fs");
import path = require("path");

export interface LocalServiceRequest {
  projectName: string;
  serviceId: string;
  packageName: string;
  className: string;
  operation: string;
  valueType: "BOOLEAN" | "INT" | "LONG" | "DOUBLE" | "STRING";
  value: string;
}

export interface LocalPipelineResult {
  generationManifest: Record<string, unknown>;
  provider: Record<string, unknown>;
  invocation: Record<string, unknown>;
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
  const expected = ["className", "operation", "packageName", "projectName", "serviceId", "value", "valueType"];
  if (keys.join("\n") !== expected.join("\n")) throw new Error("service request contains unknown or missing fields");
  const type = bounded(record.valueType, "valueType", 16);
  if (!valueTypes.has(type)) throw new Error("valueType is unsupported");
  return {
    projectName: bounded(record.projectName, "projectName", 63, projectName),
    serviceId: bounded(record.serviceId, "serviceId", 128, serviceId),
    packageName: bounded(record.packageName, "packageName", 160, packageName),
    className: bounded(record.className, "className", 64, className),
    operation: bounded(record.operation, "operation", 64, identifier),
    valueType: type as LocalServiceRequest["valueType"],
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
  const catalog = {schemaVersion: "1.0.0", catalogId: "local.catalog", services: [{serviceId: request.serviceId, operation: request.operation, host: provider.host, port: provider.port, transport: "tiny-rpc-json-line"}]};
  fs.writeFileSync(temporary, JSON.stringify(catalog, null, 2) + "\n", {flag: "wx"});
  fs.renameSync(temporary, catalogPath);
}

export async function generateBuildStartInvoke(applicationRoot: string, workspaceRoot: string, unsafeRequest: unknown): Promise<LocalPipelineResult> {
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
  const generationOutput = await runBounded(java, ["-cp", generatorJar, "io.github.davidlee.smarthome.generator.GeneratorCli", outputRoot, request.projectName, request.serviceId, request.packageName, request.className, request.operation, request.valueType, request.value], workspaceRoot, 15000);
  const generationManifest = JSON.parse(generationOutput) as Record<string, unknown>;
  const projectRoot = path.join(outputRoot, request.projectName);
  const mavenArgs = ["-s", path.resolve(settings), `-Dmaven.repo.local=${path.resolve(localRepository)}`, "package"];
  await runBounded(maven, mavenArgs, projectRoot, 180000);
  const classpath = [path.join(projectRoot, "target", "classes"), path.join(projectRoot, "target", "dependency", "*")].join(path.delimiter);
  const mainClass = `${request.packageName}.${request.className}`;
  const providerProcess = spawn(java, ["-cp", classpath, mainClass, "0"], {cwd: projectRoot, shell: false, env: process.env});
  try {
    const provider = await waitForProvider(providerProcess, 15000);
    if (provider.host !== "127.0.0.1" || !Number.isInteger(provider.port) || Number(provider.port) <= 0) throw new Error("provider announced an invalid endpoint");
    writeCatalog(workspaceRoot, provider, request);
    const invocationOutput = await runBounded(java, ["-cp", classpath, "io.smarthome.logic.tinyrpc.TinyRpcLogicCli", "invoke", "127.0.0.1", String(provider.port), request.serviceId, request.operation, "[]"], projectRoot, 15000);
    const invocation = parseSingleJsonLine(invocationOutput, "invocation-result");
    if (invocation.status !== "success") throw new Error("Logic Engine invocation did not succeed");
    return {generationManifest, provider, invocation, catalogId: "local.catalog"};
  } finally {
    await terminateBounded(providerProcess, 5000);
  }
}
