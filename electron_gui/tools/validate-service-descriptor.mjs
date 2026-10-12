import fs from "node:fs";
import path from "node:path";

const index = process.argv.indexOf("--descriptor");
if (index < 0 || !process.argv[index + 1]) throw new Error("--descriptor is required");
const descriptorPath = path.resolve(process.argv[index + 1]);
const descriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf8"));
const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join("\n") !== [...expected].sort().join("\n")) {
    throw new Error(`${label} has unknown or missing fields`);
  }
};
exactKeys(descriptor, ["endpoint", "metadata", "operations", "schemaVersion", "serviceId", "transport", "version"], "descriptor");
exactKeys(descriptor.endpoint, ["catalogId"], "endpoint");
exactKeys(descriptor.metadata, ["capabilityState"], "metadata");
exactKeys(descriptor.transport, ["kind", "protocolVersion"], "transport");
if (descriptor.schemaVersion !== "1.0.1" || descriptor.endpoint.catalogId !== "local.catalog"
    || descriptor.transport.kind !== "tiny-rpc-netty" || descriptor.transport.protocolVersion !== "1.0.0"
    || descriptor.version !== "1.0.0" || descriptor.metadata.capabilityState !== "experimental") {
  throw new Error("descriptor metadata does not match the frozen contract");
}
const expected = new Map([["setEnabled", "boolean"], ["readEnabled", "boolean"], ["readActionCount", "integer"]]);
if (!Array.isArray(descriptor.operations) || descriptor.operations.length !== expected.size) throw new Error("descriptor operation count is invalid");
for (const operation of descriptor.operations) {
  exactKeys(operation, ["name", "parameters", "returns"], "operation");
  if (!expected.has(operation.name) || operation.returns !== expected.get(operation.name)
      || !Array.isArray(operation.parameters) || operation.parameters.length !== 0) {
    throw new Error("descriptor operation signature is invalid");
  }
  expected.delete(operation.name);
}
if (expected.size !== 0) throw new Error("descriptor is missing a required operation");
process.stdout.write(JSON.stringify({status: "verified", descriptor: descriptorPath}) + "\n");
