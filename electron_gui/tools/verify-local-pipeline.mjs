import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.resolve(toolRoot, "..");
const require = createRequire(import.meta.url);
const {generateBuildStartInvoke} = require(path.join(applicationRoot, "dist", "generator_bridge.js"));
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "smarthome-management-pipeline-"));
const proof = await generateBuildStartInvoke(applicationRoot, workspace, {
  projectName: "temperature-sensor",
  serviceId: "sensor.temperature",
  packageName: "io.smarthome.generated.sensor",
  className: "TemperatureSensor",
  operation: "readCelsius",
  valueType: "DOUBLE",
  value: "21.5",
});
if (proof.invocation?.status !== "success") throw new Error("real Logic Engine invocation failed");
if (proof.invocation?.value?.type !== "number" || proof.invocation?.value?.value !== 21.5) throw new Error("unexpected typed invocation result");
const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : path.join(workspace, "pipeline-proof.json");
const publicProof = {
  schemaVersion: "1.0.0",
  status: "verified",
  generationId: proof.generationManifest.generationId,
  serviceId: proof.generationManifest.serviceId,
  catalogId: proof.catalogId,
  providerHost: proof.provider.host,
  assignedPort: Number(proof.provider.port) > 0,
  invocation: proof.invocation,
};
fs.writeFileSync(output, JSON.stringify(publicProof, null, 2) + "\n", {flag: "wx"});
process.stdout.write(JSON.stringify({output, status: "verified"}) + "\n");
