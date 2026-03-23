#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const appDir = path.join(rootDir, "app");

const importPattern = /import\s+[^"']*from\s+["']([^"']+)["']/g;

const rules = [
  {
    id: "shared-api",
    pattern: /domains\/shared\/lib\/api$/,
    message: "App routes must consume domain application/use-case APIs, not shared infrastructure API client.",
  },
  {
    id: "domain-infrastructure",
    pattern: /domains\/[^/]+\/infrastructure\//,
    message: "App routes should not import domain infrastructure adapters directly.",
  },
];

const allowedExceptions = new Map();

async function listSourceFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(fullPath)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!fullPath.endsWith(".ts") && !fullPath.endsWith(".tsx")) continue;
    files.push(fullPath);
  }

  return files;
}

function normalizePath(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

const files = await listSourceFiles(appDir);
const violations = [];

for (const filePath of files) {
  const relativePath = normalizePath(filePath);
  const source = await fs.readFile(filePath, "utf8");
  const allowed = allowedExceptions.get(relativePath) ?? new Set();

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? "";
    for (const rule of rules) {
      if (!rule.pattern.test(specifier)) continue;
      if (allowed.has(rule.id)) continue;
      violations.push({
        file: relativePath,
        specifier,
        rule: rule.id,
        message: rule.message,
      });
    }
  }
}

if (violations.length > 0) {
  console.error("Import boundary check failed.\n");
  for (const violation of violations) {
    console.error(`- [${violation.rule}] ${violation.file}`);
    console.error(`  import: ${violation.specifier}`);
    console.error(`  ${violation.message}`);
  }
  process.exit(1);
}

// AGENT-NOTE: App-layer migration completed for shared API/infrastructure coupling.
// Keep exception list empty; add only temporary scoped exceptions when an active migration requires it.
console.log(
  `Import boundary check passed for ${files.length} app files (exceptions tracked: ${allowedExceptions.size}).`
);
