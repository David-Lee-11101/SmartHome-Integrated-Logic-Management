import {readFileSync, realpathSync, statSync} from "fs";
import {isAbsolute, relative, resolve} from "path";

export interface CatalogItem {
  name: string;
  module_name: string;
}

export interface LiveChannel {
  [key: string]: unknown;
  id: string;
  offline?: string;
}

export interface ModuleEntry extends CatalogItem {
  [key: string]: unknown;
  ingredients?: Array<{[key: string]: unknown; normalized_name: string}>;
  live_channels?: LiveChannel[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function catalogItems(value: unknown): CatalogItem[] {
  const values = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : [];
  return values.map((item) => {
    if (!isRecord(item)) {
      throw new Error("catalog entries must be objects");
    }
    return {
      name: requireNonEmptyString(item.name, "catalog name"),
      module_name: requireNonEmptyString(item.module_name, "catalog module_name"),
    };
  });
}

function moduleEntries(value: unknown): ModuleEntry[] {
  if (!Array.isArray(value)) {
    throw new Error("module catalog must be an array");
  }
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new Error("module entries must be objects");
    }
    const entry: ModuleEntry = {
      ...item,
      name: requireNonEmptyString(item.name, "module entry name"),
      module_name: requireNonEmptyString(item.module_name, "module entry module_name"),
    };
    if (item.ingredients !== undefined) {
      if (!Array.isArray(item.ingredients)) {
        throw new Error("module ingredients must be an array");
      }
      entry.ingredients = item.ingredients.map((ingredient) => {
        if (!isRecord(ingredient)) {
          throw new Error("module ingredients must be objects");
        }
        return {
          ...ingredient,
          normalized_name: requireNonEmptyString(ingredient.normalized_name, "ingredient name"),
        };
      });
    }
    if (item.live_channels !== undefined) {
      if (!Array.isArray(item.live_channels)) {
        throw new Error("module live_channels must be an array");
      }
      entry.live_channels = item.live_channels.map((channel) => {
        if (!isRecord(channel)) {
          throw new Error("live channels must be objects");
        }
        return {
          ...channel,
          id: requireNonEmptyString(channel.id, "live channel id"),
          offline: typeof channel.offline === "string" ? channel.offline : undefined,
        };
      });
    }
    return entry;
  });
}

function resolveExistingFileWithinRoot(rootDirectory: string, relativePath: string): string {
  if (typeof relativePath !== "string" || relativePath.length === 0 || isAbsolute(relativePath)) {
    throw new Error("catalog path must be a non-empty relative path");
  }
  const realRoot = realpathSync(rootDirectory);
  const candidate = resolve(realRoot, relativePath);
  const lexicalRelative = relative(realRoot, candidate);
  if (lexicalRelative.startsWith("..") || isAbsolute(lexicalRelative)) {
    throw new Error("catalog path is outside catalog root");
  }
  const realCandidate = realpathSync(candidate);
  const physicalRelative = relative(realRoot, realCandidate);
  if (physicalRelative.startsWith("..") || isAbsolute(physicalRelative)) {
    throw new Error("catalog path resolves outside catalog root");
  }
  if (!statSync(realCandidate).isFile()) {
    throw new Error("catalog path must resolve to a file");
  }
  return realCandidate;
}

export function readJsonWithinRoot(rootDirectory: string, relativePath: string): unknown {
  const filePath = resolveExistingFileWithinRoot(rootDirectory, relativePath);
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

export function readCatalog(rootDirectory: string, filename: string): CatalogItem[] {
  return catalogItems(readJsonWithinRoot(rootDirectory, filename));
}

export function requireCatalogModuleId(catalog: unknown, displayName: string): string {
  requireNonEmptyString(displayName, "catalog display name");
  const match = catalogItems(catalog).find((item) => item.name === displayName);
  if (!match) {
    throw new Error("display name is not in the loaded catalog");
  }
  return match.module_name;
}

export function loadCatalogModule(
  moduleRoot: string,
  catalog: unknown,
  moduleId: string,
): ModuleEntry[] {
  requireNonEmptyString(moduleId, "module id");
  const allowed = catalogItems(catalog).some((item) => item.module_name === moduleId);
  if (!allowed) {
    throw new Error("module id is not in the loaded catalog");
  }
  return moduleEntries(readJsonWithinRoot(moduleRoot, `${moduleId}.json`));
}

export function requireModuleEntry(entries: unknown, moduleId: string): ModuleEntry {
  requireNonEmptyString(moduleId, "selected module id");
  const match = moduleEntries(entries).find((entry) => entry.module_name === moduleId);
  if (!match) {
    throw new Error("selected module id is not in the module catalog");
  }
  return match;
}

export function requireAccount(entry: ModuleEntry, accountId: string): void {
  requireNonEmptyString(accountId, "account id");
  const available = (entry.live_channels ?? []).filter((channel) => channel.offline !== "true");
  if (accountId === "no_DAC_data" && available.length === 0) {
    return;
  }
  if (!available.some((channel) => channel.id === accountId)) {
    throw new Error("account id is not owned by the selected module entry");
  }
}

export function isTrustedIpcSender(
  eventSender: object,
  frameUrl: string | undefined,
  ownedSender: object,
  expectedFrameUrl: string,
): boolean {
  return eventSender === ownedSender && frameUrl === expectedFrameUrl;
}
