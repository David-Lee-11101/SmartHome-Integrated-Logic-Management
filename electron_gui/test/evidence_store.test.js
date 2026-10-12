const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {readEvidenceSnapshot} = require("../dist/evidence_store.js");

test("an empty workspace reports absent evidence without demo records", (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "management-evidence-empty-"));
  t.after(() => fs.rmSync(workspace, {recursive: true, force: true}));
  const snapshot = readEvidenceSnapshot(workspace);
  assert.equal(snapshot.profileEvidence.status, "absent");
  assert.equal(snapshot.executionEvents.status, "absent");
});

test("the evidence view reads only fixed regular files and rejects symlinks", (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "management-evidence-safe-"));
  t.after(() => fs.rmSync(workspace, {recursive: true, force: true}));
  const evidence = path.join(workspace, "evidence");
  fs.mkdirSync(evidence);
  fs.writeFileSync(path.join(evidence, "profile-evidence.json"), JSON.stringify({schemaVersion: "1.0.1", profileId: "profile-local"}));
  let snapshot = readEvidenceSnapshot(workspace);
  assert.equal(snapshot.profileEvidence.status, "available");
  assert.equal(snapshot.profileEvidence.value.profileId, "profile-local");
  fs.symlinkSync(path.join(evidence, "profile-evidence.json"), path.join(evidence, "execution-events.json"));
  assert.throws(() => readEvidenceSnapshot(workspace), /regular file/);
});
