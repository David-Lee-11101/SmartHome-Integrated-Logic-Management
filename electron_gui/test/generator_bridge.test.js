const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {validateLocalServiceRequest} = require("../dist/generator_bridge.js");

const valid = {
  projectName: "temperature-sensor",
  serviceId: "sensor.temperature",
  packageName: "io.smarthome.generated.sensor",
  className: "TemperatureSensor",
  operation: "readCelsius",
  valueType: "DOUBLE",
  value: "21.5",
};

const stateful = {
  projectName: "virtual-switch",
  serviceId: "device.virtual-switch",
  packageName: "io.smarthome.generated.device",
  className: "VirtualSwitch",
  behavior: "STATEFUL_BOOLEAN_DEVICE_V1",
};

test("local service request accepts one bounded typed operation", () => {
  assert.deepEqual(validateLocalServiceRequest(valid), {...valid, behavior: "CONSTANT_V1"});
  assert.deepEqual(validateLocalServiceRequest({...valid, behavior: "CONSTANT_V1"}), {...valid, behavior: "CONSTANT_V1"});
  assert.deepEqual(validateLocalServiceRequest(stateful), stateful);
});

test("local service request rejects command, path, and arbitrary-source injection", () => {
  for (const mutation of [
    {projectName: "../outside"},
    {packageName: "io.smarthome;Runtime.getRuntime()"},
    {className: "../../Provider"},
    {operation: "read();"},
    {valueType: "JAVA"},
    {javaBody: "System.exit(0);"},
    {behavior: "JAVA"},
  ]) {
    assert.throws(() => validateLocalServiceRequest({...valid, ...mutation}));
  }
  assert.throws(() => validateLocalServiceRequest({...stateful, operation: "setEnabled"}));
  assert.throws(() => validateLocalServiceRequest({...stateful, initialEnabled: true}));
});

test("pipeline subprocesses use argument arrays with bounded output and no shell", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/generator_bridge.ts"), "utf8");
  assert.match(source, /shell: false/);
  assert.match(source, /maximumOutput = 1024 \* 1024/);
  assert.match(source, /timedOut = true/);
  assert.match(source, /child\.kill\("SIGKILL"\)/);
  assert.match(source, /subprocess exceeded its \$\{timeoutMs\} ms deadline/);
  assert.doesNotMatch(source, /exec\(|execSync\(|shell: true/);
  assert.match(source, /STATEFUL_BOOLEAN_DEVICE_V1/);
  assert.match(source, /Promise\.all\(Array\.from\(\{length: 8\}/);
  assert.match(source, /typedScalar\(finalCount, "integer"\) !== 10/);
});
