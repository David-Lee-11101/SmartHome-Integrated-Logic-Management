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
const constantProof = await generateBuildStartInvoke(applicationRoot, workspace, {
  projectName: "temperature-sensor",
  serviceId: "sensor.temperature",
  packageName: "io.smarthome.generated.sensor",
  className: "TemperatureSensor",
  operation: "readCelsius",
  valueType: "DOUBLE",
  value: "21.5",
});
if (constantProof.invocation?.status !== "success") throw new Error("real Logic Engine invocation failed");
if (constantProof.invocation?.value?.type !== "number" || constantProof.invocation?.value?.value !== 21.5) throw new Error("unexpected typed invocation result");
const integralProof = await generateBuildStartInvoke(applicationRoot, workspace, {
  projectName: "decimal-counter",
  serviceId: "sensor.decimal-counter",
  packageName: "io.smarthome.generated.decimal",
  className: "DecimalCounter",
  operation: "readCount",
  valueType: "INT",
  value: "012",
});
if (integralProof.invocation?.status !== "success" || integralProof.invocation?.value?.type !== "integer"
    || integralProof.invocation?.value?.value !== 12) throw new Error("generated integer changed the validated decimal value");
const proof = await generateBuildStartInvoke(applicationRoot, workspace, {
  projectName: "virtual-switch",
  serviceId: "device.virtual-switch",
  packageName: "io.smarthome.generated.device",
  className: "VirtualSwitch",
  behavior: "STATEFUL_BOOLEAN_DEVICE_V1",
});
if (proof.statefulProof?.finalCount?.value?.type !== "integer" || proof.statefulProof?.finalCount?.value?.value !== 10) {
  throw new Error("stateful provider did not preserve the expected action count");
}
const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : path.join(workspace, "pipeline-proof.json");
const descriptorIndex = process.argv.indexOf("--descriptor-output");
const descriptorOutput = descriptorIndex >= 0 ? path.resolve(process.argv[descriptorIndex + 1]) : `${output}.service-descriptor.json`;
fs.copyFileSync(path.join(workspace, "generated-services", "virtual-switch", "service-descriptor.json"), descriptorOutput, fs.constants.COPYFILE_EXCL);
const publicProof = {
  schemaVersion: "1.0.2",
  status: "verified",
  generationId: proof.generationManifest.generationId,
  serviceId: proof.generationManifest.serviceId,
  catalogId: proof.catalogId,
  providerHost: proof.provider.host,
  assignedPort: Number(proof.provider.port) > 0,
  invocation: proof.invocation,
  constantInvocation: constantProof.invocation,
  integralInvocation: integralProof.invocation,
  statefulProof: proof.statefulProof,
  contract: {
    serviceDescriptorSchemaVersion: "1.0.1",
    catalogVersion: "1.0.2",
    hubCommit: "6cb2edb1e9dbfa1572fd6f24f01cd1aef9315f8d",
    integrationApiSha256: "60284b3ce107b0948626356dcc6a6841a8c9550dbe8a5970126ad097f1dadf1a",
  },
};
fs.writeFileSync(output, JSON.stringify(publicProof, null, 2) + "\n", {flag: "wx"});
process.stdout.write(JSON.stringify({output, descriptorOutput, status: "verified"}) + "\n");
