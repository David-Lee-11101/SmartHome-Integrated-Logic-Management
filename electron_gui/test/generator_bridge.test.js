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
    {operation: "class"},
    {operation: "true"},
    {operation: "_"},
    {packageName: "io.class.generated"},
    {packageName: "io.null.generated"},
    {valueType: "JAVA"},
    {javaBody: "System.exit(0);"},
    {behavior: "JAVA"},
  ]) {
    assert.throws(() => validateLocalServiceRequest({...valid, ...mutation}));
  }
  assert.throws(() => validateLocalServiceRequest({...stateful, operation: "setEnabled"}));
  assert.throws(() => validateLocalServiceRequest({...stateful, initialEnabled: true}));
});

test("constant operation names preserve compilable Object overrides and reject incompatible noarg signatures", () => {
  for (const [operation, valueType, value] of [["toString", "STRING", "example"], ["hashCode", "INT", "1"],
      ["clone", "STRING", "example"], ["equals", "BOOLEAN", "true"]]) {
    assert.equal(validateLocalServiceRequest({...valid, operation, valueType, value}).operation, operation);
  }
  for (const [operation, valueType, value] of [["getClass", "BOOLEAN", "true"], ["notify", "INT", "1"],
      ["notifyAll", "STRING", "example"], ["wait", "DOUBLE", "1"], ["finalize", "LONG", "1"],
      ["toString", "INT", "1"], ["hashCode", "LONG", "1"], ["clone", "BOOLEAN", "true"]]) {
    assert.throws(() => validateLocalServiceRequest({...valid, operation, valueType, value}), /inherited Object/);
  }
});

test("class names reject actual template symbols while preserving unrelated and behavior-specific valid names", () => {
  for (const className of ["String", "Exception", "Integer", "Runtime", "Thread", "System", "IllegalArgumentException",
      "TypedValue", "TinyRpcTypedProvider", "TinyRpcServer", "List", "CountDownLatch"]) {
    assert.throws(() => validateLocalServiceRequest({...valid, className}), /provider template/);
    assert.throws(() => validateLocalServiceRequest({...stateful, className}), /provider template/);
  }
  for (const className of ["Object", "Long", "IllegalStateException"]) {
    assert.equal(validateLocalServiceRequest({...valid, className}).className, className);
    assert.throws(() => validateLocalServiceRequest({...stateful, className}), /provider template/);
  }
  for (const className of ["ValueType", "Boolean", "Double", "StringBuilder", "TemperatureSensor"]) {
    assert.equal(validateLocalServiceRequest({...valid, className}).className, className);
    assert.equal(validateLocalServiceRequest({...stateful, className}).className, className);
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
  assert.match(source, /STATEFUL_BOOLEAN_DEVICE_V1/);
  assert.match(source, /Promise\.all\(Array\.from\(\{length: 8\}/);
  assert.match(source, /typedScalar\(finalCount, "integer"\) !== 10/);
});
