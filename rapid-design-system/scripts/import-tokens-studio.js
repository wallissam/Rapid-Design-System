#!/usr/bin/env node

/**
 * Rapid Design System — Tokens Studio Import
 *
 * Transforms a Tokens Studio (formerly Figma Tokens) JSON export
 * into the Rapid token format (tokens/base.json + tokens/dark.json).
 *
 * Tokens Studio is the most popular community plugin for managing
 * design tokens in Figma.  It works on all Figma plans.
 *
 * Supported Tokens Studio formats:
 *   • Single-file export (global set)
 *   • Multi-set export with light/dark sets
 *   • $themes + $metadata wrappers
 *   • Token references like {color.brand.primary}
 *   • Math expressions like {spacing.sm} * 2
 *
 * Usage:
 *   npm run import:tokens-studio -- path/to/tokens.json
 *   npm run import:tokens-studio -- tokens-export.json --dry-run
 *   npm run import:tokens-studio -- tokens-export.json --sets light=Light,dark=Dark
 *
 * The script auto-detects the format.  If your file has multiple
 * token sets, use --sets to tell it which set is light and which
 * is dark.  If there's only one set, it becomes base.json and
 * dark.json is left empty.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TOKENS_DIR = path.join(ROOT, "tokens");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const inputPath = args.find((a) => !a.startsWith("--"));
const setsArg = args.find((a) => a.startsWith("--sets="))?.slice(7) ?? null;

if (!inputPath) {
  console.error(
    "[tokens-studio] Usage: node scripts/import-tokens-studio.js <input.json> [--dry-run] [--sets light=SetName,dark=SetName]"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Tokens Studio format handling
// ---------------------------------------------------------------------------

/**
 * Tokens Studio wraps each token value in { value, type, description? }.
 * This function recursively unwraps to just the value, producing our
 * flat JSON shape.
 */
function unwrapTokenValues(obj) {
  if (typeof obj !== "object" || obj === null) return obj;

  if ("value" in obj && "type" in obj) {
    return processTokenValue(obj.value, obj.type);
  }

  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith("$")) continue;
    result[key] = unwrapTokenValues(val);
  }
  return result;
}

function processTokenValue(value, type) {
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    return { __ref: value.slice(1, -1) };
  }

  switch (type) {
    case "color":
      return String(value);

    case "spacing":
    case "sizing":
    case "borderRadius":
    case "borderWidth":
    case "fontSize":
    case "lineHeight":
    case "paragraphSpacing":
      return formatNumeric(value);

    case "fontFamilies":
    case "fontFamily":
      return String(value);

    case "fontWeights":
    case "fontWeight":
      return String(fontWeightToNumeric(value));

    case "boxShadow":
      return formatShadow(value);

    case "opacity":
      return String(value);

    default:
      return String(value);
  }
}

function formatNumeric(value) {
  if (typeof value === "number") return `${value}px`;
  const str = String(value);
  if (/^\d+(\.\d+)?$/.test(str)) return `${str}px`;
  return str;
}

function fontWeightToNumeric(value) {
  const map = {
    thin: "100", hairline: "100",
    extralight: "200", ultralight: "200",
    light: "300",
    regular: "400", normal: "400",
    medium: "500",
    semibold: "600", demibold: "600",
    bold: "700",
    extrabold: "800", ultrabold: "800",
    black: "900", heavy: "900",
  };
  const lower = String(value).toLowerCase().replace(/[\s-]/g, "");
  return map[lower] ?? String(value);
}

function formatShadow(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(formatSingleShadow).join(", ");
  }
  if (typeof value === "object") {
    return formatSingleShadow(value);
  }
  return String(value);
}

function formatSingleShadow({ x, y, blur, spread, color, type }) {
  const parts = [];
  if (type === "innerShadow" || type === "inset") parts.push("inset");
  parts.push(`${x ?? 0}px`, `${y ?? 0}px`, `${blur ?? 0}px`);
  if (spread !== undefined) parts.push(`${spread}px`);
  if (color) parts.push(color);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Reference resolution
// ---------------------------------------------------------------------------

/**
 * Resolve token references ({color.brand.primary}) to actual values.
 * Two-pass: first collect all values, then resolve references.
 */
function resolveReferences(tokens) {
  const flat = flattenForRefs(tokens);
  return resolveRefTree(tokens, flat);
}

function flattenForRefs(obj, prefix = "") {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof val === "object" && val !== null && !("__ref" in val)) {
      Object.assign(result, flattenForRefs(val, fullKey));
    } else if (typeof val === "object" && val !== null && "__ref" in val) {
      result[fullKey] = val;
    } else {
      result[fullKey] = val;
    }
  }
  return result;
}

function resolveRefTree(obj, flat, depth = 0) {
  if (depth > 20) return obj;
  if (typeof obj !== "object" || obj === null) return obj;

  if ("__ref" in obj) {
    const refPath = obj.__ref;
    const resolved = flat[refPath];
    if (resolved === undefined) {
      log(`  WARNING: Unresolved reference {${refPath}}`);
      return `{${refPath}}`;
    }
    if (typeof resolved === "object" && "__ref" in resolved) {
      return resolveRefTree(resolved, flat, depth + 1);
    }
    return resolved;
  }

  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = resolveRefTree(val, flat, depth);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Set detection
// ---------------------------------------------------------------------------

function detectSets(raw) {
  const sets = { light: null, dark: null };
  const lightPatterns = [/^light$/i, /^global$/i, /^base$/i, /^core$/i, /^default$/i];
  const darkPatterns = [/^dark$/i, /^night$/i];

  if (setsArg) {
    for (const part of setsArg.split(",")) {
      const [side, name] = part.split("=");
      if (side === "light") sets.light = name;
      if (side === "dark") sets.dark = name;
    }
    return sets;
  }

  const setNames = Object.keys(raw).filter((k) => !k.startsWith("$"));

  if (setNames.length === 0) return sets;
  if (setNames.length === 1) {
    sets.light = setNames[0];
    return sets;
  }

  for (const name of setNames) {
    for (const pat of lightPatterns) {
      if (pat.test(name)) { sets.light = name; break; }
    }
    for (const pat of darkPatterns) {
      if (pat.test(name)) { sets.dark = name; break; }
    }
  }

  if (!sets.light) {
    sets.light = setNames.find((n) => n !== sets.dark) ?? setNames[0];
  }

  return sets;
}

/**
 * Detect whether a raw object is a single flat token set (every leaf
 * has {value, type}) or a multi-set file (top-level keys are set names).
 */
function isMultiSet(raw) {
  const keys = Object.keys(raw).filter((k) => !k.startsWith("$"));
  if (keys.length === 0) return false;

  for (const key of keys.slice(0, 3)) {
    const val = raw[key];
    if (typeof val !== "object" || val === null) continue;
    if ("value" in val && "type" in val) return false;

    const subKeys = Object.keys(val).filter((k) => !k.startsWith("$"));
    for (const sk of subKeys.slice(0, 3)) {
      const sv = val[sk];
      if (typeof sv === "object" && sv !== null) {
        if ("value" in sv && "type" in sv) return true;
        const deeper = Object.values(sv).find((v) => typeof v === "object" && v !== null);
        if (deeper && "value" in deeper && "type" in deeper) return true;
      }
    }
  }

  return keys.length > 1;
}

// ---------------------------------------------------------------------------
// Diff (keep dark.json minimal)
// ---------------------------------------------------------------------------

function diffOnly(light, dark) {
  const result = {};
  for (const [key, darkVal] of Object.entries(dark)) {
    const lightVal = light[key];
    if (typeof darkVal === "object" && darkVal !== null && typeof lightVal === "object" && lightVal !== null) {
      const nested = diffOnly(lightVal, darkVal);
      if (Object.keys(nested).length > 0) result[key] = nested;
    } else if (darkVal !== lightVal) {
      result[key] = darkVal;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function writeTokenFile(filePath, tokens) {
  const content = JSON.stringify(tokens, null, 2) + "\n";
  const rel = path.relative(ROOT, filePath);
  if (DRY_RUN) {
    log(`\n  [dry-run] Would write ${rel}:`);
    const lines = content.split("\n");
    console.log(lines.slice(0, 30).join("\n"));
    if (lines.length > 30) console.log(`  … (${lines.length - 30} more lines)`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  log(`  ✓ ${rel}`);
}

function countLeaves(obj) {
  let n = 0;
  for (const val of Object.values(obj)) {
    if (typeof val === "object" && val !== null) n += countLeaves(val);
    else n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg) { console.log(`[tokens-studio] ${msg}`); }

// ---------------------------------------------------------------------------
// Remap helpers — normalize Tokens Studio naming to RDS conventions
// ---------------------------------------------------------------------------

/**
 * Tokens Studio uses keys like "fontFamilies", "fontWeights",
 * "borderRadius", etc.  Remap to our schema shape.
 */
function remapKeys(obj) {
  const keyMap = {
    fontfamilies: "font.family",
    fontfamily: "font.family",
    fontweights: "font.weight",
    fontweight: "font.weight",
    fontsizes: "font.size",
    fontsize: "font.size",
    lineheights: "line-height",
    borderradius: "radius",
    borderwidth: "border-width",
    paragraphspacing: "paragraph-spacing",
    letterspacing: "letter-spacing",
    boxshadow: "shadow",
    sizing: "spacing",
    colors: "color",
  };

  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const lk = key.toLowerCase();
    const remapped = keyMap[lk] ?? key;

    if (remapped.includes(".")) {
      const [parent, child] = remapped.split(".");
      if (!(parent in result)) result[parent] = {};
      if (typeof val === "object" && val !== null) {
        result[parent][child] = { ...(result[parent][child] || {}), ...val };
      } else {
        result[parent][child] = val;
      }
    } else {
      result[remapped] = val;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  log("Rapid Design System — Tokens Studio Import\n");
  if (DRY_RUN) log("  --dry-run mode: no files will be written\n");

  const absPath = path.resolve(inputPath);
  if (!fs.existsSync(absPath)) {
    console.error(`[tokens-studio] ERROR: File not found: ${absPath}`);
    process.exit(1);
  }

  log(`  Reading: ${path.relative(process.cwd(), absPath)}\n`);
  const raw = JSON.parse(fs.readFileSync(absPath, "utf-8"));

  let lightTokens = {};
  let darkTokens = {};

  if (isMultiSet(raw)) {
    const sets = detectSets(raw);
    log(`  Detected multi-set file`);
    log(`  Light set: "${sets.light ?? "(none)"}"`);
    log(`  Dark set:  "${sets.dark ?? "(none)"}"\n`);

    if (sets.light && raw[sets.light]) {
      lightTokens = unwrapTokenValues(raw[sets.light]);
    }
    if (sets.dark && raw[sets.dark]) {
      darkTokens = unwrapTokenValues(raw[sets.dark]);
    }
  } else {
    log("  Detected single-set file\n");
    lightTokens = unwrapTokenValues(raw);
  }

  lightTokens = remapKeys(lightTokens);
  darkTokens = remapKeys(darkTokens);

  lightTokens = resolveReferences(lightTokens);
  darkTokens = resolveReferences(darkTokens);

  if (Object.keys(darkTokens).length > 0) {
    darkTokens = diffOnly(lightTokens, darkTokens);
  }

  const lightCount = countLeaves(lightTokens);
  const darkCount = countLeaves(darkTokens);
  log(`  Light tokens: ${lightCount}`);
  log(`  Dark overrides: ${darkCount}\n`);

  writeTokenFile(path.join(TOKENS_DIR, "base.json"), lightTokens);
  writeTokenFile(path.join(TOKENS_DIR, "dark.json"), darkTokens);

  if (!DRY_RUN) {
    log("\n  Token files updated. Run 'npm run build' to compile downstream artefacts.");
  }

  log("\nDone.");
}

main();
