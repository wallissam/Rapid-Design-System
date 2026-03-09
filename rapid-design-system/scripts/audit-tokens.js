#!/usr/bin/env node

/**
 * Rapid Design System — Token Usage Audit
 *
 * Scans a target codebase and produces a governance report:
 *   - Which Rapid tokens are used vs. unused
 *   - Hardcoded colour/spacing values that bypass the token system
 *   - Adoption percentage across scanned files
 *   - Per-file breakdown
 *
 * Usage:
 *   node scripts/audit-tokens.js ./src              — scan the ./src directory
 *   node scripts/audit-tokens.js ./src --format json — machine-readable output
 *   node scripts/audit-tokens.js ./src --strict      — exit 1 if adoption < 100%
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TOKENS_PATH = path.join(ROOT, "tokens", "base.json");

const args = process.argv.slice(2);
const targetDir = args.find((a) => !a.startsWith("--"));
const FORMAT_JSON = args.includes("--format") && args.includes("json");
const STRICT = args.includes("--strict");

if (!targetDir) {
  console.log("Usage: node scripts/audit-tokens.js <directory> [--format json] [--strict]");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Token inventory
// ---------------------------------------------------------------------------

function flatten(obj, prefix = "") {
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key === "_comment") continue;
    const fullKey = prefix ? `${prefix}-${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      entries.push(...flatten(value, fullKey));
    } else {
      entries.push([fullKey, value]);
    }
  }
  return entries;
}

function loadTokenInventory() {
  const base = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf-8"));
  const flat = flatten(base);
  return flat.map(([key, value]) => ({
    key,
    cssVar: `--rapid-${key}`,
    value,
  }));
}

// ---------------------------------------------------------------------------
// File scanning
// ---------------------------------------------------------------------------

const SCAN_EXTENSIONS = new Set([
  ".html", ".htm", ".css", ".scss", ".less",
  ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte",
]);

function walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      results.push(...walkDir(fullPath));
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

// Patterns for hardcoded values that should be tokens
const HARDCODED_PATTERNS = [
  { name: "hex color", pattern: /(?<![a-zA-Z0-9-])#[0-9a-fA-F]{6}(?![0-9a-fA-F])/g },
  { name: "hex color (short)", pattern: /(?<![a-zA-Z0-9-])#[0-9a-fA-F]{3}(?![0-9a-fA-F])/g },
  { name: "rgb/rgba", pattern: /rgba?\(\s*\d+/g },
  { name: "hardcoded px (likely spacing)", pattern: /(?<![a-zA-Z0-9-])(4|8|12|16|24|32|48)px(?![0-9])/g },
];

function scanFile(filePath, tokenVars) {
  const content = fs.readFileSync(filePath, "utf-8");
  const result = {
    file: filePath,
    tokensUsed: [],
    hardcoded: [],
  };

  for (const token of tokenVars) {
    if (content.includes(token.cssVar)) {
      result.tokensUsed.push(token.cssVar);
    }
  }

  // Only flag hardcoded values in non-generated files
  const isGenerated = content.includes("AUTO-GENERATED") || content.includes("DO NOT EDIT");
  if (!isGenerated) {
    for (const { name, pattern } of HARDCODED_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          result.hardcoded.push({ type: name, value: match });
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function generateReport(inventory, scanResults) {
  const usedVars = new Set();
  let totalHardcoded = 0;
  const fileReports = [];

  for (const result of scanResults) {
    for (const v of result.tokensUsed) usedVars.add(v);
    totalHardcoded += result.hardcoded.length;
    if (result.tokensUsed.length > 0 || result.hardcoded.length > 0) {
      fileReports.push(result);
    }
  }

  const unusedTokens = inventory.filter((t) => !usedVars.has(t.cssVar));
  const adoptionPct = inventory.length > 0
    ? ((usedVars.size / inventory.length) * 100).toFixed(1)
    : "0.0";

  return {
    summary: {
      totalTokens: inventory.length,
      tokensUsed: usedVars.size,
      tokensUnused: unusedTokens.length,
      adoptionPercent: parseFloat(adoptionPct),
      hardcodedValues: totalHardcoded,
      filesScanned: scanResults.length,
      filesWithTokens: fileReports.filter((f) => f.tokensUsed.length > 0).length,
      filesWithHardcoded: fileReports.filter((f) => f.hardcoded.length > 0).length,
    },
    unusedTokens: unusedTokens.map((t) => t.cssVar),
    hardcodedByFile: fileReports
      .filter((f) => f.hardcoded.length > 0)
      .map((f) => ({
        file: path.relative(process.cwd(), f.file),
        count: f.hardcoded.length,
        samples: f.hardcoded.slice(0, 5).map((h) => `${h.type}: ${h.value}`),
      })),
  };
}

function printReport(report) {
  const s = report.summary;

  console.log(`\n  ┌─────────────────────────────────────────────────┐`);
  console.log(`  │  Rapid Design System — Token Governance Report  │`);
  console.log(`  └─────────────────────────────────────────────────┘\n`);

  const bar = (pct) => {
    const filled = Math.round(pct / 2.5);
    return "█".repeat(filled) + "░".repeat(40 - filled);
  };

  console.log(`  Token Adoption:  ${bar(s.adoptionPercent)}  ${s.adoptionPercent}%`);
  console.log(`  Tokens used:     ${s.tokensUsed} / ${s.totalTokens}`);
  console.log(`  Tokens unused:   ${s.tokensUnused}`);
  console.log(`  Hardcoded values found: ${s.hardcodedValues}`);
  console.log(`  Files scanned:   ${s.filesScanned}`);
  console.log(`  Files using tokens: ${s.filesWithTokens}`);
  console.log(`  Files with hardcoded values: ${s.filesWithHardcoded}`);
  console.log("");

  if (report.unusedTokens.length > 0 && report.unusedTokens.length <= 20) {
    console.log("  Unused tokens:");
    for (const t of report.unusedTokens) {
      console.log(`    ○ ${t}`);
    }
    console.log("");
  } else if (report.unusedTokens.length > 20) {
    console.log(`  Unused tokens: ${report.unusedTokens.length} (use --format json for full list)\n`);
  }

  if (report.hardcodedByFile.length > 0) {
    console.log("  Hardcoded values (should be Rapid tokens):");
    for (const f of report.hardcodedByFile.slice(0, 10)) {
      console.log(`    ${f.file} (${f.count} instances)`);
      for (const s of f.samples) {
        console.log(`      → ${s}`);
      }
    }
    if (report.hardcodedByFile.length > 10) {
      console.log(`    … and ${report.hardcodedByFile.length - 10} more files`);
    }
    console.log("");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const absTarget = path.resolve(targetDir);
  if (!fs.existsSync(absTarget)) {
    console.error(`[audit] Directory not found: ${absTarget}`);
    process.exit(1);
  }

  const inventory = loadTokenInventory();
  const files = walkDir(absTarget);
  const scanResults = files.map((f) => scanFile(f, inventory));
  const report = generateReport(inventory, scanResults);

  if (FORMAT_JSON) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  if (STRICT && report.summary.adoptionPercent < 100) {
    process.exit(1);
  }
}

main();
