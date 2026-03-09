#!/usr/bin/env node

/**
 * Rapid Design System — Figma Variables Sync
 *
 * Pulls variables from the Figma Variables REST API and writes
 * them to tokens/base.json and tokens/dark.json.
 *
 * Prerequisites:
 *   • FIGMA_TOKEN env var  — Personal Access Token (or OAuth token)
 *   • .figmarc.json        — Config file with file key + mode mapping
 *
 * Usage:
 *   npm run sync:figma              — Pull + write + build
 *   npm run sync:figma -- --dry-run — Preview without writing files
 *   FIGMA_TOKEN=xxx node scripts/sync-figma.js
 *
 * Requires a Figma plan that supports the Variables API (Enterprise / Org).
 * For teams on Professional/Free plans, use Tokens Studio instead:
 *   npm run import:tokens-studio -- path/to/export.json
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const TOKENS_DIR = path.join(ROOT, "tokens");
const CONFIG_PATH = path.join(ROOT, ".figmarc.json");

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const VERBOSE = args.includes("--verbose") || args.includes("-v");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fatal(
      "Missing .figmarc.json — copy .figmarc.example.json and fill in your file key.\n" +
      "  cp .figmarc.example.json .figmarc.json"
    );
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  if (!cfg.fileKey) {
    fatal(".figmarc.json is missing the required 'fileKey' field.");
  }
  return {
    fileKey: cfg.fileKey,
    lightMode: cfg.modes?.light ?? null,
    darkMode: cfg.modes?.dark ?? null,
    includeCollections: cfg.collections?.include ?? null,
    excludeCollections: cfg.collections?.exclude ?? [],
    variablePrefix: cfg.variablePrefix ?? "",
    unitSuffix: cfg.unitSuffix ?? { spacing: "px", radius: "px", "font-size": "px" },
  };
}

// ---------------------------------------------------------------------------
// Figma API
// ---------------------------------------------------------------------------

function figmaToken() {
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    fatal(
      "FIGMA_TOKEN environment variable is not set.\n" +
      "  Create a Personal Access Token at https://www.figma.com/developers/api#access-tokens\n" +
      "  Then: export FIGMA_TOKEN=figd_xxxx"
    );
  }
  return token;
}

function figmaGet(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.figma.com",
      path: endpoint,
      headers: { "X-FIGMA-TOKEN": figmaToken() },
    };

    https.get(options, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) {
          reject(new Error(`Figma API ${res.statusCode}: ${body.slice(0, 300)}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`Failed to parse Figma response: ${e.message}`)); }
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function fetchVariables(fileKey) {
  log("Fetching variables from Figma…");
  const data = await figmaGet(`/v1/files/${fileKey}/variables/local`);
  return data.meta;
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

function rgbaToHex({ r, g, b, a }) {
  const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  if (a !== undefined && a < 1) {
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
  }
  return hex;
}

/**
 * Convert a Figma variable name (slash-separated) to a nested path array.
 * e.g. "color/brand/primary" → ["color", "brand", "primary"]
 */
function nameToPath(name, prefix) {
  const cleaned = prefix && name.startsWith(prefix)
    ? name.slice(prefix.length)
    : name;
  return cleaned
    .replace(/\//g, ".")
    .split(".")
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean);
}

function setNested(obj, pathArr, value) {
  let cursor = obj;
  for (let i = 0; i < pathArr.length - 1; i++) {
    const key = pathArr[i];
    if (!(key in cursor) || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[pathArr[pathArr.length - 1]] = value;
}

/**
 * Format a raw Figma value for our JSON schema.
 */
function formatValue(variable, rawValue, config) {
  if (rawValue === undefined || rawValue === null) return null;

  if (typeof rawValue === "object" && rawValue.type === "VARIABLE_ALIAS") {
    return rawValue;
  }

  const type = variable.resolvedType;

  if (type === "COLOR" && typeof rawValue === "object" && "r" in rawValue) {
    return rgbaToHex(rawValue);
  }

  if (type === "FLOAT") {
    const num = rawValue;
    const nameLower = variable.name.toLowerCase();
    for (const [category, suffix] of Object.entries(config.unitSuffix)) {
      if (nameLower.includes(category)) {
        return Number.isInteger(num) ? `${num}${suffix}` : `${num}${suffix}`;
      }
    }
    return String(num);
  }

  if (type === "STRING") {
    return String(rawValue);
  }

  return String(rawValue);
}

// ---------------------------------------------------------------------------
// Mode detection
// ---------------------------------------------------------------------------

function detectModes(collections, config) {
  const allModes = [];
  for (const col of Object.values(collections)) {
    for (const mode of col.modes) {
      allModes.push({ collectionName: col.name, ...mode });
    }
  }

  const lightPatterns = [/^light$/i, /^default$/i, /^mode\s*1$/i, /^base$/i];
  const darkPatterns = [/^dark$/i, /^mode\s*2$/i, /^night$/i];

  let lightModeId = null;
  let darkModeId = null;

  if (config.lightMode) {
    const m = allModes.find((m) => m.name === config.lightMode);
    if (m) lightModeId = m.modeId;
  }
  if (config.darkMode) {
    const m = allModes.find((m) => m.name === config.darkMode);
    if (m) darkModeId = m.modeId;
  }

  if (!lightModeId) {
    for (const pat of lightPatterns) {
      const m = allModes.find((m) => pat.test(m.name));
      if (m) { lightModeId = m.modeId; break; }
    }
  }
  if (!darkModeId) {
    for (const pat of darkPatterns) {
      const m = allModes.find((m) => pat.test(m.name));
      if (m) { darkModeId = m.modeId; break; }
    }
  }

  if (!lightModeId && allModes.length > 0) {
    lightModeId = allModes[0].modeId;
  }

  const lightName = allModes.find((m) => m.modeId === lightModeId)?.name ?? "(first)";
  const darkName = darkModeId
    ? allModes.find((m) => m.modeId === darkModeId)?.name
    : null;

  log(`  Light mode: "${lightName}"`);
  log(`  Dark mode:  ${darkName ? `"${darkName}"` : "(not found — dark.json will be empty)"}`);

  return { lightModeId, darkModeId };
}

// ---------------------------------------------------------------------------
// Main transform
// ---------------------------------------------------------------------------

function shouldIncludeCollection(collectionName, config) {
  if (config.excludeCollections.includes(collectionName)) return false;
  if (config.includeCollections) return config.includeCollections.includes(collectionName);
  return true;
}

function resolveAlias(aliasValue, variables, modeId, visited = new Set()) {
  if (!aliasValue || aliasValue.type !== "VARIABLE_ALIAS") return null;
  if (visited.has(aliasValue.id)) return null;
  visited.add(aliasValue.id);

  const target = variables[aliasValue.id];
  if (!target) return null;

  const targetValue = target.valuesByMode[modeId];
  if (targetValue && typeof targetValue === "object" && targetValue.type === "VARIABLE_ALIAS") {
    return resolveAlias(targetValue, variables, modeId, visited);
  }
  return { variable: target, rawValue: targetValue };
}

function buildTokenObject(variables, collections, modeId, config) {
  const result = {};
  if (!modeId) return result;

  for (const variable of Object.values(variables)) {
    const collection = collections[variable.variableCollectionId];
    if (!collection) continue;
    if (!shouldIncludeCollection(collection.name, config)) continue;
    if (!variable.valuesByMode[modeId] && !findModeInCollection(collection, modeId)) continue;

    let rawValue = variable.valuesByMode[modeId];

    if (rawValue && typeof rawValue === "object" && rawValue.type === "VARIABLE_ALIAS") {
      const resolved = resolveAlias(rawValue, variables, modeId);
      if (resolved) {
        rawValue = resolved.rawValue;
        variable._resolvedFrom = resolved.variable.name;
      } else {
        continue;
      }
    }

    if (rawValue === undefined || rawValue === null) continue;

    const formatted = formatValue(variable, rawValue, config);
    if (formatted === null) continue;

    const tokenPath = nameToPath(variable.name, config.variablePrefix);
    if (tokenPath.length === 0) continue;

    setNested(result, tokenPath, formatted);
  }

  return result;
}

function findModeInCollection(collection, modeId) {
  return collection.modes.some((m) => m.modeId === modeId);
}

/**
 * For the dark token set, only include values that actually differ
 * from the light set.  This keeps dark.json minimal.
 */
function diffOnly(lightTokens, darkTokens) {
  return diffObjects(lightTokens, darkTokens);
}

function diffObjects(light, dark) {
  const result = {};
  for (const [key, darkVal] of Object.entries(dark)) {
    const lightVal = light[key];
    if (typeof darkVal === "object" && darkVal !== null && typeof lightVal === "object" && lightVal !== null) {
      const nested = diffObjects(lightVal, darkVal);
      if (Object.keys(nested).length > 0) {
        result[key] = nested;
      }
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
  if (DRY_RUN) {
    const rel = path.relative(ROOT, filePath);
    log(`\n  [dry-run] Would write ${rel}:`);
    const lines = content.split("\n");
    const preview = lines.slice(0, 30).join("\n");
    console.log(preview);
    if (lines.length > 30) console.log(`  … (${lines.length - 30} more lines)`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  const rel = path.relative(ROOT, filePath);
  log(`  ✓ ${rel} (${Object.keys(flatCount(tokens))} tokens)`);
}

function flatCount(obj, n = { count: 0 }) {
  for (const val of Object.values(obj)) {
    if (typeof val === "object" && val !== null) flatCount(val, n);
    else n.count++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg) { console.log(`[figma-sync] ${msg}`); }
function fatal(msg) { console.error(`[figma-sync] ERROR: ${msg}`); process.exit(1); }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log("Rapid Design System — Figma Variables Sync\n");

  if (DRY_RUN) log("  --dry-run mode: no files will be written\n");

  const config = loadConfig();
  const meta = await fetchVariables(config.fileKey);
  const { variableCollections, variables } = meta;

  const collectionNames = Object.values(variableCollections).map((c) => c.name);
  log(`  Found ${collectionNames.length} collection(s): ${collectionNames.join(", ")}`);
  log(`  Found ${Object.keys(variables).length} variable(s)\n`);

  const { lightModeId, darkModeId } = detectModes(variableCollections, config);
  log("");

  const lightTokens = buildTokenObject(variables, variableCollections, lightModeId, config);
  const darkTokensRaw = buildTokenObject(variables, variableCollections, darkModeId, config);
  const darkTokens = darkModeId ? diffOnly(lightTokens, darkTokensRaw) : {};

  const lightCount = flatCount(lightTokens).count;
  const darkCount = flatCount(darkTokens).count;
  log(`  Light tokens: ${lightCount}`);
  log(`  Dark overrides: ${darkCount}\n`);

  if (lightCount === 0) {
    log("  WARNING: No tokens extracted. Check your .figmarc.json collection/mode config.\n");
  }

  writeTokenFile(path.join(TOKENS_DIR, "base.json"), lightTokens);
  writeTokenFile(path.join(TOKENS_DIR, "dark.json"), darkTokens);

  if (!DRY_RUN) {
    log("\n  Token files updated. Run 'npm run build' to compile downstream artefacts.");
  }

  log("\nDone.");
}

main().catch((err) => {
  fatal(err.message);
});
