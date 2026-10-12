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

test("local service request accepts one bounded typed operation", () => {
  assert.deepEqual(validateLocalServiceRequest(valid), valid);
});

test("local service request rejects command, path, and arbitrary-source injection", () => {
  for (const mutation of [
    {projectName: "../outside"},
    {packageName: "io.smarthome;Runtime.getRuntime()"},
    {className: "../../Provider"},
    {operation: "read();"},
    {valueType: "JAVA"},
    {javaBody: "System.exit(0);"},
  ]) {
    assert.throws(() => validateLocalServiceRequest({...valid, ...mutation}));
  }
});

test("pipeline subprocesses use argument arrays with bounded output and no shell", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/generator_bridge.ts"), "utf8");
  assert.match(source, /shell: false/);
  assert.match(source, /maximumOutput = 1024 \* 1024/);
  assert.match(source, /timedOut = true/);
  assert.match(source, /child\.kill\("SIGKILL"\)/);
  assert.match(source, /subprocess exceeded its \$\{timeoutMs\} ms deadline/);
  assert.doesNotMatch(source, /exec\(|execSync\(|shell: true/);
});
