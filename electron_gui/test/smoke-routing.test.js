const assert = require("node:assert/strict");
const test = require("node:test");

test("native and packaged Linux smoke route through Xvfb with the normal Chromium sandbox", async () => {
  const {routeElectronSmoke} = await import("../tools/electron-smoke-route.mjs");
  const appArguments = ["--self-check", "--offline", "--report", "/tmp/report.json"];
  const linux = routeElectronSmoke("/opt/electron/electron", appArguments, "linux");
  assert.deepEqual(linux, {
    command: "xvfb-run",
    args: ["-a", "/opt/electron/electron", ...appArguments],
  });
  assert.equal(linux.args.includes("--no-sandbox"), false);
  assert.deepEqual(routeElectronSmoke("electron.exe", appArguments, "win32"), {
    command: "electron.exe",
    args: appArguments,
  });
  assert.deepEqual(routeElectronSmoke("/Applications/Electron", appArguments, "darwin"), {
    command: "/Applications/Electron",
    args: appArguments,
  });
});
