#!/usr/bin/env node

/**
 * Rapid Design System — Codemod / Migration Tool
 *
 * Scans a target codebase and replaces hardcoded values with
 * var(--rapid-*) references.  Transforms an existing project to
 * use the RDS token system in minutes instead of weeks.
 *
 * What it replaces:
 *   - Hex colours (#0f6cbd → var(--rapid-color-brand-primary))
 *   - Common spacing literals (16px → var(--rapid-spacing-md))
 *   - Font families ('Segoe UI'... → var(--rapid-font-family-base))
 *   - Font sizes (14px → var(--rapid-font-size-md))
 *   - Border radii (4px in border-radius context → var(--rapid-radius-md))
 *   - Shadow values (exact match → var(--rapid-shadow-*))
 *
 * Usage:
 *   node scripts/migrate.js ./src                    — preview changes (dry run)
 *   node scripts/migrate.js ./src --apply            — write changes to disk
 *   node scripts/migrate.js ./src --apply --verbose  — write + show every replacement
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BASE_PATH = path.join(ROOT, "tokens", "base.json");

const args = process.argv.slice(2);
const targetDir = args.find((a) => !a.startsWith("--"));
const APPLY = args.includes("--apply");
const VERBOSE = args.includes("--verbose");

if (!targetDir) {
  console.log(
    "Usage: node scripts/migrate.js <directory> [--apply] [--verbose]\n\n" +
    "  Without --apply: preview changes (dry run)\n" +
    "  With --apply:    write changes to disk\n"
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Build replacement maps from tokens
// ---------------------------------------------------------------------------

function flatten(obj, prefix = "") {
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key === "_comment") continue;
    const fullKey = prefix ? `${prefix}-${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      entries.push(...flatten(value, fullKey));
    } else {
      entries.push([fullKey, String(value)]);
    }
  }
  return entries;
}

function buildReplacementMaps(tokens) {
  const entries = flatten(tokens);

  const colorMap = new Map();
  const spacingMap = new Map();
  const fontSizeMap = new Map();
  const radiusMap = new Map();
  const shadowMap = new Map();
  const fontFamilyMap = new Map();

  for (const [key, value] of entries) {
    const cssVar = `var(--rapid-${key})`;

    if (key.startsWith("color-") && value.startsWith("#") && value.length === 7) {
      colorMap.set(value.toLowerCase(), { cssVar, key });
    }

    if (key.startsWith("spacing-") && value.endsWith("px")) {
      spacingMap.set(value, { cssVar, key });
    }

    if (key.startsWith("font-size-") && value.endsWith("px")) {
      fontSizeMap.set(value, { cssVar, key });
    }

    if (key.startsWith("radius-") && value.endsWith("px")) {
      radiusMap.set(value, { cssVar, key });
    }

    if (key.startsWith("shadow-")) {
      shadowMap.set(value.trim(), { cssVar, key });
    }

    if (key.startsWith("font-family-")) {
      const simplified = value.replace(/'/g, "").split(",")[0].trim().toLowerCase();
      fontFamilyMap.set(simplified, { cssVar, key, fullValue: value });
    }
  }

  return { colorMap, spacingMap, fontSizeMap, radiusMap, shadowMap, fontFamilyMap };
}

// ---------------------------------------------------------------------------
// File processing
// ---------------------------------------------------------------------------

const SCAN_EXTENSIONS = new Set([
  ".css", ".scss", ".less", ".html", ".htm",
  ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte",
]);

function walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "packages") continue;
      results.push(...walkDir(fullPath));
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

function processFile(filePath, maps) {
  const original = fs.readFileSync(filePath, "utf-8");

  if (original.includes("AUTO-GENERATED") || original.includes("DO NOT EDIT")) {
    return { filePath, changed: false, replacements: [] };
  }

  let content = original;
  const replacements = [];

  // 1. Hex colours
  content = content.replace(/#[0-9a-fA-F]{6}\b/g, (match, offset) => {
    const before = content.substring(Math.max(0, offset - 20), offset);
    if (before.includes("var(") || before.includes("--rapid")) return match;

    const token = maps.colorMap.get(match.toLowerCase());
    if (!token) return match;
    replacements.push({ type: "color", from: match, to: token.cssVar, token: token.key });
    return token.cssVar;
  });

  // 2. Shadow values (exact string match — do before spacing to avoid partial matches)
  for (const [shadowValue, token] of maps.shadowMap) {
    if (content.includes(shadowValue)) {
      const escaped = shadowValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped, "g");
      content = content.replace(re, (match, offset) => {
        const before = content.substring(Math.max(0, offset - 10), offset);
        if (before.includes("var(")) return match;
        replacements.push({ type: "shadow", from: match.slice(0, 30) + "...", to: token.cssVar, token: token.key });
        return token.cssVar;
      });
    }
  }

  // 3. Font family (look for the primary font name in font-family declarations)
  for (const [fontName, token] of maps.fontFamilyMap) {
    const re = new RegExp(`font-family\\s*:\\s*[^;]*${fontName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^;]*`, "gi");
    content = content.replace(re, (match) => {
      if (match.includes("var(--rapid")) return match;
      replacements.push({ type: "font-family", from: match.slice(0, 40) + "...", to: `font-family: ${token.cssVar}`, token: token.key });
      return `font-family: ${token.cssVar}`;
    });
  }

  // 4. Font sizes in font-size context
  content = content.replace(/font-size\s*:\s*(\d+px)/g, (match, px) => {
    if (match.includes("var(")) return match;
    const token = maps.fontSizeMap.get(px);
    if (!token) return match;
    replacements.push({ type: "font-size", from: match, to: `font-size: ${token.cssVar}`, token: token.key });
    return `font-size: ${token.cssVar}`;
  });

  // 5. Border radius in border-radius context
  content = content.replace(/border-radius\s*:\s*(\d+px)/g, (match, px) => {
    if (match.includes("var(")) return match;
    const token = maps.radiusMap.get(px);
    if (!token) return match;
    replacements.push({ type: "radius", from: match, to: `border-radius: ${token.cssVar}`, token: token.key });
    return `border-radius: ${token.cssVar}`;
  });

  // 6. Padding/margin spacing
  const spacingProps = ["padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "padding-inline", "padding-block", "margin", "margin-top", "margin-right", "margin-bottom",
    "margin-left", "margin-inline", "margin-block", "gap", "row-gap", "column-gap"];

  for (const prop of spacingProps) {
    const re = new RegExp(`(${prop})\\s*:\\s*(\\d+px)`, "g");
    content = content.replace(re, (match, p, px) => {
      if (match.includes("var(")) return match;
      const token = maps.spacingMap.get(px);
      if (!token) return match;
      replacements.push({ type: "spacing", from: match, to: `${p}: ${token.cssVar}`, token: token.key });
      return `${p}: ${token.cssVar}`;
    });
  }

  const changed = content !== original;
  return { filePath, changed, content, replacements };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function main() {
  console.log("\n  ┌───────────────────────────────────────────────────┐");
  console.log("  │  Rapid Design System — Codemod / Migration Tool  │");
  console.log(`  │  Mode: ${APPLY ? "APPLY (writing files)" : "DRY RUN (preview only)"}                      │`);
  console.log("  └───────────────────────────────────────────────────┘\n");

  const absTarget = path.resolve(targetDir);
  if (!fs.existsSync(absTarget)) {
    console.error(`  ERROR: Directory not found: ${absTarget}`);
    process.exit(1);
  }

  const tokens = JSON.parse(fs.readFileSync(BASE_PATH, "utf-8"));
  const maps = buildReplacementMaps(tokens);

  console.log(`  Token maps loaded:`);
  console.log(`    ${maps.colorMap.size} colours, ${maps.spacingMap.size} spacing, ${maps.fontSizeMap.size} font sizes`);
  console.log(`    ${maps.radiusMap.size} radii, ${maps.shadowMap.size} shadows, ${maps.fontFamilyMap.size} font families\n`);

  const files = walkDir(absTarget);
  console.log(`  Scanning ${files.length} file(s) in ${path.relative(process.cwd(), absTarget)}/\n`);

  let totalReplacements = 0;
  let filesChanged = 0;
  const typeCounts = {};

  for (const filePath of files) {
    const result = processFile(filePath, maps);
    if (!result.changed) continue;

    filesChanged++;
    totalReplacements += result.replacements.length;

    const rel = path.relative(process.cwd(), result.filePath);
    console.log(`  ${APPLY ? "✓" : "~"} ${rel} (${result.replacements.length} replacement(s))`);

    for (const r of result.replacements) {
      typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
      if (VERBOSE) {
        console.log(`      ${r.type}: ${r.from} → ${r.to}`);
      }
    }

    if (APPLY) {
      fs.writeFileSync(result.filePath, result.content);
    }
  }

  console.log(`\n  ─────────────────────────────────────`);
  console.log(`  Files ${APPLY ? "modified" : "to modify"}: ${filesChanged} / ${files.length}`);
  console.log(`  Total replacements: ${totalReplacements}`);
  if (Object.keys(typeCounts).length > 0) {
    console.log(`  By type:`);
    for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type}: ${count}`);
    }
  }

  if (!APPLY && totalReplacements > 0) {
    console.log(`\n  Run with --apply to write changes to disk.`);
  }

  console.log("");
}

main();
