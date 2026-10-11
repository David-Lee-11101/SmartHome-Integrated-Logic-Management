const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  isTrustedIpcSender,
  loadCatalogModule,
  requireCatalogModuleId,
  requireModuleEntry,
} = require("../dist/json_loader.js");

test("IPC trust requires the exact owned webContents and local frame URL", () => {
  const ownedSender = {};
  const foreignSender = {};
  const localUrl = "file:///tmp/composer/electron_gui/assets/index.html";

  assert.equal(isTrustedIpcSender(ownedSender, localUrl, ownedSender, localUrl), true);
  assert.equal(isTrustedIpcSender(foreignSender, localUrl, ownedSender, localUrl), false);
  assert.equal(
    isTrustedIpcSender(ownedSender, "https://attacker.invalid/index.html", ownedSender, localUrl),
    false,
  );
  assert.equal(
    isTrustedIpcSender(ownedSender, "file:///tmp/composer/electron_gui/assets/other.html", ownedSender, localUrl),
    false,
  );
});

test("catalog module loading rejects traversal, absolute, unlisted, and symlink escapes", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "composer-catalog-"));
  t.after(() => fs.rmSync(temporaryRoot, {recursive: true, force: true}));

  const catalogRoot = path.join(temporaryRoot, "catalog");
  const outsideRoot = path.join(temporaryRoot, "outside");
  fs.mkdirSync(catalogRoot);
  fs.mkdirSync(outsideRoot);
  fs.writeFileSync(path.join(catalogRoot, "safe_service.json"), JSON.stringify([
    {
      name: "Safe Action",
      module_name: "safe_action",
      fields: [{name: "message"}],
      live_channels: [{id: "owned-account", user_name_field: "Demo"}],
    },
  ]));
  fs.writeFileSync(path.join(outsideRoot, "secret.json"), JSON.stringify({secret: true}));
  fs.symlinkSync(path.join(outsideRoot, "secret.json"), path.join(catalogRoot, "linked_service.json"));

  const catalog = [
    {name: "Safe Service", module_name: "safe_service"},
    {name: "Linked Service", module_name: "linked_service"},
  ];

  const safeModule = loadCatalogModule(catalogRoot, catalog, "safe_service");
  assert.equal(safeModule[0].module_name, "safe_action");
  assert.equal(safeModule[0].live_channels[0].id, "owned-account");
  assert.deepEqual(safeModule[0].fields, [{name: "message"}]);
  assert.equal(safeModule[0].live_channels[0].user_name_field, "Demo");
  assert.throws(() => loadCatalogModule(catalogRoot, catalog, "../secret"), /catalog/);
  assert.throws(() => loadCatalogModule(catalogRoot, catalog, path.join(outsideRoot, "secret")), /catalog/);
  assert.throws(() => loadCatalogModule(catalogRoot, catalog, "unlisted"), /catalog/);
  assert.throws(() => loadCatalogModule(catalogRoot, catalog, "linked_service"), /outside catalog root/);
});

test("catalog and module membership checks fail closed", () => {
  const catalog = [{name: "Safe Service", module_name: "safe_service"}];
  const moduleEntries = [{name: "Safe Action", module_name: "safe_action", live_channels: [{id: "owned-account"}]}];

  assert.equal(requireCatalogModuleId(catalog, "Safe Service"), "safe_service");
  assert.throws(() => requireCatalogModuleId(catalog, "Unknown Service"), /catalog/);
  assert.equal(requireModuleEntry(moduleEntries, "safe_action").module_name, "safe_action");
  assert.throws(() => requireModuleEntry(moduleEntries, "unknown_action"), /module catalog/);
});

test("the renderer uses only local assets and preserves the editor content API", () => {
  const html = fs.readFileSync(path.join(__dirname, "../assets/index.html"), "utf8");
  const script = fs.readFileSync(path.join(__dirname, "../assets/script.js"), "utf8");

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /<textarea id="editor"/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(script, /https?:\/\/|monaco|require\.config/);
  assert.match(script, /window\.getEditorContent/);
});
