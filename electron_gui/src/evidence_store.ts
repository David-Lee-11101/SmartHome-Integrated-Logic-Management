import fs = require("fs");
import path = require("path");

export interface EvidenceRecord {
  status: "available" | "absent";
  fileName: string;
  value?: unknown;
}

export interface EvidenceSnapshot {
  logicDefinition: EvidenceRecord;
  profileEvidence: EvidenceRecord;
  schedulingDecision: EvidenceRecord;
  executionEvents: EvidenceRecord;
}

const maximumEvidenceBytes = 1024 * 1024;
const evidenceFiles = {
  logicDefinition: "logic-definition.json",
  profileEvidence: "profile-evidence.json",
  schedulingDecision: "scheduling-decision.json",
  executionEvents: "execution-events.json",
} as const;

function readEvidenceFile(evidenceRoot: string, fileName: string): EvidenceRecord {
  const file = path.join(evidenceRoot, fileName);
  if (!fs.existsSync(file)) return {status: "absent", fileName};
  const metadata = fs.lstatSync(file);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`${fileName} must be a regular file`);
  if (metadata.size > maximumEvidenceBytes) throw new Error(`${fileName} exceeds one MiB`);
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  if (typeof value !== "object" || value === null) throw new Error(`${fileName} must contain a JSON object or array`);
  return {status: "available", fileName, value};
}

export function readEvidenceSnapshot(workspaceRoot: string): EvidenceSnapshot {
  const evidenceRoot = path.join(workspaceRoot, "evidence");
  if (!fs.existsSync(evidenceRoot)) {
    return Object.fromEntries(Object.entries(evidenceFiles).map(([key, fileName]) => [key, {status: "absent", fileName}])) as unknown as EvidenceSnapshot;
  }
  const metadata = fs.lstatSync(evidenceRoot);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("evidence must be a regular directory");
  return {
    logicDefinition: readEvidenceFile(evidenceRoot, evidenceFiles.logicDefinition),
    profileEvidence: readEvidenceFile(evidenceRoot, evidenceFiles.profileEvidence),
    schedulingDecision: readEvidenceFile(evidenceRoot, evidenceFiles.schedulingDecision),
    executionEvents: readEvidenceFile(evidenceRoot, evidenceFiles.executionEvents),
  };
}
