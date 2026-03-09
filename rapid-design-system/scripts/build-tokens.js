#!/usr/bin/env node

/**
 * Rapid Design System — Token Build Pipeline
 *
 * Single entry point that reads the canonical JSON token files and
 * emits every downstream artefact from a single `npm run build`.
 *
 * Extensibility:
 *   If tokens/local.json exists, it is deep-merged ON TOP of base.json.
 *   If tokens/local-dark.json exists, it is deep-merged ON TOP of dark.json.
 *   This lets consumers override standard values or add entirely new tokens
 *   without touching base.json.  See tokens/local.example.json for patterns.
 *
 * Core outputs:
 *   • packages/css/global.css             – :root + [data-theme="dark"] custom properties
 *   • packages/css/utilities.css          – .rapid-* utility classes
 *   • packages/css/scoped-overrides.css   – Template for CSS-level scoping (meant to be copied + edited)
 *   • packages/fluent-adapter/index.ts       – Fluent UI v9 theme object → CSS var() refs
 *   • packages/fluent-adapter/Provider.tsx    – <RapidFluentProvider> wrapper (v9)
 *   • packages/fluent-v8-adapter/index.ts     – Fluent UI v8 theme: IPalette + ISemanticColors + IEffects + IFontStyles
 *   • packages/fluent-v8-adapter/Provider.tsx  – <RapidFluentV8Provider> wrapper (v8)
 *
 * CSS Variable Override Adapters (load after library CSS):
 *   • packages/adapters/bootstrap5.css     – Bootstrap 5.3+
 *   • packages/adapters/ag-grid.css        – AG Grid Community / Enterprise
 *   • packages/adapters/fullcalendar.css   – FullCalendar v6
 *   • packages/adapters/telerik-kendo.css  – Telerik Kendo UI
 *   • packages/adapters/sweetalert2.css    – SweetAlert2
 *   • packages/adapters/devextreme.css     – DevExtreme
 *   • packages/adapters/primereact.css     – PrimeReact / PrimeFaces / PrimeVue
 *   • packages/adapters/bryntum.css        – Bryntum Grid / Scheduler / Gantt
 *
 * CSS Class Override Adapters:
 *   • packages/adapters/highcharts.css     – Highcharts Styled Mode (SVG class overrides)
 *
 * Platform Bridge Adapters:
 *   • packages/adapters/spfx.css           – SharePoint Framework theme slots
 *   • packages/adapters/pcf-theme-bridge.ts – Power Apps PCF control bridge
 *
 * JavaScript Bridge Adapters (for canvas / imperative libraries):
 *   • packages/adapters/_css-vars-bridge.ts – Shared utility: read computed Rapid tokens
 *   • packages/adapters/chartjs.ts          – Chart.js defaults + plugin
 *   • packages/adapters/highcharts.ts       – Highcharts.setOptions() bridge (non-styled)
 *
 * Config Presets:
 *   • packages/adapters/tailwind-preset.js  – Tailwind CSS theme preset
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TOKENS_DIR = path.join(ROOT, "tokens");
const CSS_DIR = path.join(ROOT, "packages", "css");
const FLUENT_DIR = path.join(ROOT, "packages", "fluent-adapter");
const FLUENT_V8_DIR = path.join(ROOT, "packages", "fluent-v8-adapter");
const ADAPTERS_DIR = path.join(ROOT, "packages", "adapters");

const PREFIX = "rapid";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SAFE_TOKEN_KEY = /^[a-z0-9][a-z0-9-]*$/i;
const CSS_INJECTION_CHARS = /[;{}\\<>]/;

function isSafeKey(key) {
  return !UNSAFE_KEYS.has(key);
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error(`[RDS] ERROR: Failed to parse ${path.relative(ROOT, filePath)}: ${err.message}`);
    process.exit(1);
  }
}

function readJSONIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    const content = readJSON(filePath);
    if (content && typeof content === "object" && Object.keys(content).length > 0) {
      return content;
    }
  }
  return null;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Recursively merge `source` onto `target`.  Leaf values in `source`
 * override `target`.  New branches in `source` are added.  `target`
 * keys not present in `source` are preserved.
 * Rejects __proto__, constructor, prototype keys to prevent pollution.
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const [key, val] of Object.entries(source)) {
    if (key === "_comment" || !isSafeKey(key)) continue;
    if (
      typeof val === "object" && val !== null && !Array.isArray(val) &&
      typeof result[key] === "object" && result[key] !== null && !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Compare two flattened token sets and report what changed.
 * Returns { overrides: [...], extensions: [...] }
 */
function diffTokens(baseFlatKeys, mergedFlatKeys) {
  const baseSet = new Set(baseFlatKeys);
  const overrides = [];
  const extensions = [];
  for (const key of mergedFlatKeys) {
    if (baseSet.has(key)) {
      // exists in base — could be overridden (we check value later)
    } else {
      extensions.push(key);
    }
  }
  return { extensions };
}

function flatten(obj, parentKey = "") {
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key === "_comment" || !isSafeKey(key)) continue;
    const fullKey = parentKey ? `${parentKey}-${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      entries.push(...flatten(value, fullKey));
    } else {
      entries.push([fullKey, value]);
    }
  }
  return entries;
}

/** Same as flatten() but uses "." as the path separator, preserving hyphens within key names. */
function flattenDotPath(obj, parentKey = "") {
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key === "_comment" || !isSafeKey(key)) continue;
    const fullKey = parentKey ? `${parentKey}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      entries.push(...flattenDotPath(value, fullKey));
    } else {
      entries.push([fullKey, value]);
    }
  }
  return entries;
}

/**
 * Sanitize a token value before emitting it into CSS.
 * Rejects values containing characters that could break out of
 * a CSS custom property declaration (; { } \ < >).
 */
function sanitizeCSSValue(value) {
  const str = String(value);
  if (CSS_INJECTION_CHARS.test(str)) {
    console.warn(`[RDS] WARNING: Rejected unsafe token value: "${str.slice(0, 60)}"`);
    return "/* REJECTED: unsafe value */";
  }
  return str;
}

/**
 * Validate that a flat token key is safe for use as a CSS identifier.
 */
function validateTokenKey(flatKey) {
  if (!SAFE_TOKEN_KEY.test(flatKey.replace(/-/g, ""))) {
    console.warn(`[RDS] WARNING: Rejected unsafe token key: "${flatKey.slice(0, 60)}"`);
    return false;
  }
  return true;
}

function toCSSVar(flatKey) {
  return `--${PREFIX}-${flatKey}`;
}

function v(tokenKey) {
  return `var(${toCSSVar(tokenKey)})`;
}

function fileHeader(title, extra) {
  const lines = [
    `/* ============================================================`,
    ` * Rapid Design System — ${title}`,
    ` * AUTO-GENERATED by scripts/build-tokens.js — DO NOT EDIT`,
  ];
  if (extra) {
    lines.push(` *`);
    for (const line of extra) lines.push(` * ${line}`);
  }
  lines.push(` * ============================================================ */`);
  return lines.join("\n");
}

function emit(filePath, content, label) {
  fs.writeFileSync(filePath, content);
  const rel = path.relative(ROOT, filePath);
  console.log(`[RDS] ✓ ${rel}`);
}

/**
 * Resolve $-references in token values.  A value starting with "$"
 * refers to another token path using dot notation:
 *   "color.action.primary": "$color.brand.primary"
 * resolves to the value of color.brand.primary.
 * This enables semantic aliasing without duplicating values.
 */
function resolveAliases(obj) {
  const flat = {};
  function collectFlat(o, prefix) {
    for (const [k, v] of Object.entries(o)) {
      if (k === "_comment" || !isSafeKey(k)) continue;
      const path = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        collectFlat(v, path);
      } else {
        flat[path] = v;
      }
    }
  }
  collectFlat(obj, "");

  let changed = true;
  let depth = 0;
  while (changed && depth < 20) {
    changed = false;
    depth++;
    for (const [key, val] of Object.entries(flat)) {
      if (typeof val === "string" && val.startsWith("$")) {
        const ref = val.slice(1);
        if (flat[ref] !== undefined && !String(flat[ref]).startsWith("$")) {
          flat[key] = flat[ref];
          changed = true;
        }
      }
    }
  }

  const result = {};
  for (const [dottedKey, val] of Object.entries(flat)) {
    const parts = dottedKey.split(".");
    let cursor = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in cursor)) cursor[parts[i]] = {};
      cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = val;
  }
  return result;
}

/**
 * Load and merge optional local token files onto the canonical tokens.
 * Also loads named brand themes from tokens/themes/*.json.
 * Returns { tokens, dark, themes, stats }.
 */
function loadAndMergeTokens() {
  let baseTokens = readJSON(path.join(TOKENS_DIR, "base.json"));
  let darkTokens = readJSON(path.join(TOKENS_DIR, "dark.json"));

  const localPath = path.join(TOKENS_DIR, "local.json");
  const localDarkPath = path.join(TOKENS_DIR, "local-dark.json");
  const local = readJSONIfExists(localPath);
  const localDark = readJSONIfExists(localDarkPath);

  const baseFlatKeys = flatten(baseTokens).map(([k]) => k);

  let mergedBase = baseTokens;
  let mergedDark = darkTokens;
  const stats = { localLoaded: false, localDarkLoaded: false, overrides: 0, extensions: 0, themes: [] };

  if (local) {
    mergedBase = deepMerge(baseTokens, local);
    stats.localLoaded = true;
    const localFlatKeys = flatten(local).map(([k]) => k);
    const baseSet = new Set(baseFlatKeys);
    for (const k of localFlatKeys) {
      if (baseSet.has(k)) stats.overrides++;
      else stats.extensions++;
    }
  }

  if (localDark) {
    mergedDark = deepMerge(darkTokens, localDark);
    stats.localDarkLoaded = true;
  }

  // Resolve $-aliases AFTER merging, so local refs can see base tokens
  mergedBase = resolveAliases(mergedBase);
  mergedDark = resolveAliases(mergedDark);

  // Named brand themes from tokens/themes/*.json
  const themes = {};
  const themesDir = path.join(TOKENS_DIR, "themes");
  if (fs.existsSync(themesDir)) {
    for (const file of fs.readdirSync(themesDir).filter((f) => f.endsWith(".json"))) {
      const name = file.replace(/\.json$/, "");
      const raw = readJSON(path.join(themesDir, file));
      themes[name] = resolveAliases(raw);
      stats.themes.push(name);
    }
  }

  return { tokens: mergedBase, dark: mergedDark, themes, stats };
}

// ═══════════════════════════════════════════════════════════════════════════
//  CORE OUTPUTS
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// global.css — :root + [data-theme="dark"]
// ---------------------------------------------------------------------------

function buildGlobalCSS(baseTokens, darkTokens, themes) {
  const baseEntries = flatten(baseTokens);
  const darkEntries = flatten(darkTokens);

  let css = fileHeader("Global CSS Custom Properties") + "\n\n";

  css += `:root {\n`;
  for (const [key, value] of baseEntries) {
    if (!validateTokenKey(key)) continue;
    css += `  ${toCSSVar(key)}: ${sanitizeCSSValue(value)};\n`;
  }
  css += `}\n\n`;

  css += `[data-theme="dark"] {\n`;
  for (const [key, value] of darkEntries) {
    if (!validateTokenKey(key)) continue;
    css += `  ${toCSSVar(key)}: ${sanitizeCSSValue(value)};\n`;
  }
  css += `}\n`;

  // Named brand themes
  if (themes && Object.keys(themes).length > 0) {
    for (const [name, themeTokens] of Object.entries(themes)) {
      const entries = flatten(themeTokens);
      if (entries.length === 0) continue;
      css += `\n[data-theme="${sanitizeCSSValue(name)}"] {\n`;
      for (const [key, value] of entries) {
        if (!validateTokenKey(key)) continue;
        css += `  ${toCSSVar(key)}: ${sanitizeCSSValue(value)};\n`;
      }
      css += `}\n`;
    }
  }

  return css;
}

// ---------------------------------------------------------------------------
// utilities.css — .rapid-* utility classes
// ---------------------------------------------------------------------------

function buildUtilitiesCSS(baseTokens) {
  const lines = [fileHeader("Utility Classes"), ""];

  // --- Colors: bg, text (foreground), border ---
  lines.push("/* Colors */");
  const colorEntries = flatten(baseTokens.color || {}, "color");
  for (const [key] of colorEntries) {
    const varRef = `var(${toCSSVar(key)})`;
    const slug = key.replace(/^color-/, "");
    // Avoid double-prefix: "text-primary" not "text-text-primary"
    const textSlug = slug.startsWith("text-") ? slug.replace(/^text-/, "") : slug;
    lines.push(`.${PREFIX}-bg-${slug} { background-color: ${varRef}; }`);
    lines.push(`.${PREFIX}-text-${textSlug} { color: ${varRef}; }`);
    lines.push(`.${PREFIX}-border-${slug} { border-color: ${varRef}; }`);
  }
  lines.push("");

  // --- Spacing: all-sides, directional, gap ---
  lines.push("/* Spacing */");
  const spacingEntries = flatten(baseTokens.spacing || {}, "spacing");
  for (const [key] of spacingEntries) {
    const varRef = `var(${toCSSVar(key)})`;
    const s = key.replace(/^spacing-/, "");
    lines.push(`.${PREFIX}-p-${s} { padding: ${varRef}; }`);
    lines.push(`.${PREFIX}-px-${s} { padding-inline: ${varRef}; }`);
    lines.push(`.${PREFIX}-py-${s} { padding-block: ${varRef}; }`);
    lines.push(`.${PREFIX}-pt-${s} { padding-top: ${varRef}; }`);
    lines.push(`.${PREFIX}-pr-${s} { padding-right: ${varRef}; }`);
    lines.push(`.${PREFIX}-pb-${s} { padding-bottom: ${varRef}; }`);
    lines.push(`.${PREFIX}-pl-${s} { padding-left: ${varRef}; }`);
    lines.push(`.${PREFIX}-m-${s} { margin: ${varRef}; }`);
    lines.push(`.${PREFIX}-mx-${s} { margin-inline: ${varRef}; }`);
    lines.push(`.${PREFIX}-my-${s} { margin-block: ${varRef}; }`);
    lines.push(`.${PREFIX}-mt-${s} { margin-top: ${varRef}; }`);
    lines.push(`.${PREFIX}-mr-${s} { margin-right: ${varRef}; }`);
    lines.push(`.${PREFIX}-mb-${s} { margin-bottom: ${varRef}; }`);
    lines.push(`.${PREFIX}-ml-${s} { margin-left: ${varRef}; }`);
    lines.push(`.${PREFIX}-gap-${s} { gap: ${varRef}; }`);
  }
  lines.push("");

  // --- Border radius ---
  lines.push("/* Border radius */");
  for (const [key] of flatten(baseTokens.radius || {}, "radius")) {
    const slug = key.replace(/^radius-/, "");
    lines.push(`.${PREFIX}-rounded-${slug} { border-radius: var(${toCSSVar(key)}); }`);
  }
  lines.push("");

  // --- Shadow ---
  lines.push("/* Shadow */");
  for (const [key] of flatten(baseTokens.shadow || {}, "shadow")) {
    const slug = key.replace(/^shadow-/, "");
    lines.push(`.${PREFIX}-shadow-${slug} { box-shadow: var(${toCSSVar(key)}); }`);
  }
  lines.push("");

  // --- Typography ---
  lines.push("/* Typography */");
  for (const [key] of flatten(baseTokens.font?.size || {}, "font-size")) {
    const slug = key.replace(/^font-size-/, "");
    lines.push(`.${PREFIX}-text-size-${slug} { font-size: var(${toCSSVar(key)}); }`);
  }
  for (const [key] of flatten(baseTokens.font?.weight || {}, "font-weight")) {
    const slug = key.replace(/^font-weight-/, "");
    lines.push(`.${PREFIX}-font-${slug} { font-weight: var(${toCSSVar(key)}); }`);
  }
  for (const [key] of flatten(baseTokens.font?.["line-height"] || {}, "font-line-height")) {
    const slug = key.replace(/^font-line-height-/, "");
    lines.push(`.${PREFIX}-leading-${slug} { line-height: var(${toCSSVar(key)}); }`);
  }
  for (const [key] of flatten(baseTokens.font?.["letter-spacing"] || {}, "font-letter-spacing")) {
    const slug = key.replace(/^font-letter-spacing-/, "");
    lines.push(`.${PREFIX}-tracking-${slug} { letter-spacing: var(${toCSSVar(key)}); }`);
  }
  lines.push("");

  // --- Opacity ---
  lines.push("/* Opacity */");
  for (const [key] of flatten(baseTokens.opacity || {}, "opacity")) {
    const slug = key.replace(/^opacity-/, "");
    lines.push(`.${PREFIX}-opacity-${slug} { opacity: var(${toCSSVar(key)}); }`);
  }
  lines.push("");

  // --- Z-index ---
  lines.push("/* Z-index */");
  for (const [key] of flatten(baseTokens.z || {}, "z")) {
    const slug = key.replace(/^z-/, "");
    lines.push(`.${PREFIX}-z-${slug} { z-index: var(${toCSSVar(key)}); }`);
  }
  lines.push("");

  // --- Duration ---
  lines.push("/* Transition duration */");
  for (const [key] of flatten(baseTokens.duration || {}, "duration")) {
    const slug = key.replace(/^duration-/, "");
    lines.push(`.${PREFIX}-duration-${slug} { transition-duration: var(${toCSSVar(key)}); }`);
  }
  lines.push("");

  // --- Focus ring ---
  lines.push("/* Focus ring */");
  lines.push(`.${PREFIX}-focus-ring:focus-visible { outline: var(--${PREFIX}-focus-width) solid var(--${PREFIX}-color-focus-ring); outline-offset: var(--${PREFIX}-focus-offset); }`);
  lines.push("");

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// scoped-overrides.css — Template for CSS-level extensibility
// ---------------------------------------------------------------------------

function buildScopedOverridesCSS(baseTokens) {
  const allEntries = flatten(baseTokens);

  const lines = [
    fileHeader("Scoped Overrides Template", [
      "Copy this file into your project and customise it.",
      "Unlike other generated files, THIS ONE is meant to be edited.",
      "",
      "Three extensibility patterns are demonstrated below:",
      "  1. Product / section-level brand overrides",
      "  2. Component-level micro-scoping",
      "  3. User-preference / media-query overrides",
      "",
      "CSS custom property inheritance means children automatically",
      "pick up the closest ancestor's value — no rebuild required.",
    ]),
    "",
    "/* ─── 1. Product / Section Overrides ────────────────────────── */",
    "/*",
    " * Apply to any container element via class or data attribute.",
    " * Everything inside inherits the override, including all Rapid",
    " * utility classes and every adapter (Fluent, AG Grid, etc.).",
    " *",
    " *   <div class=\"rapid-scope-billing\">",
    " *     <FluentProvider ...>  ← automatically picks up #0e7a0d",
    " *   </div>",
    " */",
    "",
    "/*",
    ".rapid-scope-billing {",
    "  --rapid-color-brand-primary: #0e7a0d;",
    "  --rapid-color-brand-secondary: #0b6b0b;",
    "  --rapid-color-brand-tertiary: #094509;",
    "}",
    "",
    ".rapid-scope-marketing {",
    "  --rapid-color-brand-primary: #e74c3c;",
    "  --rapid-color-brand-secondary: #c0392b;",
    "  --rapid-color-brand-tertiary: #a93226;",
    "}",
    "*/",
    "",
    "/* ─── 2. Component-Level Micro-Scoping ─────────────────────── */",
    "/*",
    " * Override tokens for a specific component instance using a",
    " * data attribute.  Useful for one-off visual tweaks.",
    " *",
    " *   <div data-rapid-surface=\"elevated\">",
    " *     This panel has different surface + shadow tokens.",
    " *   </div>",
    " */",
    "",
    "/*",
    "[data-rapid-surface=\"elevated\"] {",
    "  --rapid-color-surface-base: var(--rapid-color-surface-raised);",
    "  --rapid-shadow-md: var(--rapid-shadow-lg);",
    "}",
    "*/",
    "",
    "/* ─── 3. User-Preference / Media Overrides ──────────────────── */",
    "/*",
    " * Respond to system-level preferences without JS.  These compose",
    " * with data-theme — they only fire when no explicit theme is set.",
    " */",
    "",
    "/*",
    "@media (prefers-color-scheme: dark) {",
    "  :root:not([data-theme]) {",
    "    --rapid-color-brand-primary: #479ef5;",
    "    --rapid-color-surface-base: #1b1b1b;",
    "    --rapid-color-surface-raised: #2d2d2d;",
    "    --rapid-color-surface-overlay: #383838;",
    "    --rapid-color-text-primary: #e0e0e0;",
    "    --rapid-color-text-secondary: #adadad;",
    "    --rapid-color-border-default: #484848;",
    "  }",
    "}",
    "",
    "@media (prefers-contrast: more) {",
    "  :root {",
    "    --rapid-color-text-primary: #000000;",
    "    --rapid-color-text-secondary: #333333;",
    "    --rapid-color-border-default: #000000;",
    "    --rapid-color-border-strong: #000000;",
    "  }",
    "",
    "  [data-theme=\"dark\"] {",
    "    --rapid-color-text-primary: #ffffff;",
    "    --rapid-color-text-secondary: #cccccc;",
    "    --rapid-color-border-default: #ffffff;",
    "    --rapid-color-border-strong: #ffffff;",
    "  }",
    "}",
    "*/",
    "",
    "/* ─── 4. Custom Token Extensions ──────────────────────────── */",
    "/*",
    " * If you added custom tokens via tokens/local.json, their CSS",
    " * variables are already generated in global.css.  You can also",
    " * define entirely new tokens here without touching the build.",
    " *",
    " * Convention: keep the --rapid- prefix so all adapters and",
    " * the _css-vars-bridge.ts utility can read them.",
    " */",
    "",
    "/*",
    ":root {",
    "  --rapid-color-accent-coral: #ff6b6b;",
    "  --rapid-color-accent-teal: #2ec4b6;",
    "  --rapid-duration-fast: 150ms;",
    "  --rapid-duration-normal: 300ms;",
    "  --rapid-z-dropdown: 1000;",
    "  --rapid-z-modal: 1400;",
    "}",
    "",
    "[data-theme=\"dark\"] {",
    "  --rapid-color-accent-coral: #ff8a8a;",
    "  --rapid-color-accent-teal: #5de8d8;",
    "}",
    "*/",
    "",
  ];

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Fluent UI v9 adapter — index.ts
// ---------------------------------------------------------------------------

function buildFluentAdapter() {
  const map = {
    // Brand
    colorBrandBackground: "color-brand-primary",
    colorBrandBackgroundHover: "color-brand-secondary",
    colorBrandBackgroundPressed: "color-brand-tertiary",
    colorBrandForeground1: "color-brand-primary",
    colorBrandForeground2: "color-brand-secondary",
    colorBrandForegroundOnLight: "color-brand-primary",
    colorBrandForegroundLink: "color-text-link",
    colorBrandForegroundLinkHover: "color-text-link-hover",
    colorCompoundBrandBackground: "color-brand-primary",
    colorCompoundBrandBackgroundHover: "color-brand-secondary",
    colorCompoundBrandBackgroundPressed: "color-brand-tertiary",
    colorCompoundBrandStroke: "color-brand-primary",
    colorCompoundBrandStrokeHover: "color-brand-secondary",
    colorCompoundBrandStrokePressed: "color-brand-tertiary",
    colorBrandStroke1: "color-brand-primary",
    colorBrandStroke2: "color-brand-secondary",

    // Neutral backgrounds
    colorNeutralBackground1: "color-surface-base",
    colorNeutralBackground1Hover: "color-surface-overlay",
    colorNeutralBackground1Pressed: "color-surface-overlay",
    colorNeutralBackground2: "color-surface-raised",
    colorNeutralBackground3: "color-surface-overlay",
    colorNeutralBackground4: "color-surface-overlay",
    colorNeutralBackground5: "color-surface-overlay",
    colorNeutralBackground6: "color-surface-raised",
    colorNeutralBackgroundDisabled: "color-surface-disabled",
    colorSubtleBackground: "color-surface-base",
    colorSubtleBackgroundHover: "color-surface-overlay",
    colorSubtleBackgroundPressed: "color-surface-overlay",
    colorTransparentBackground: "color-surface-base",

    // Neutral foregrounds
    colorNeutralForeground1: "color-text-primary",
    colorNeutralForeground2: "color-text-secondary",
    colorNeutralForeground3: "color-text-secondary",
    colorNeutralForeground4: "color-text-disabled",
    colorNeutralForegroundDisabled: "color-text-disabled",
    colorNeutralForegroundOnBrand: "color-text-on-brand",

    // Strokes
    colorNeutralStroke1: "color-border-default",
    colorNeutralStroke1Hover: "color-border-strong",
    colorNeutralStroke1Pressed: "color-border-strong",
    colorNeutralStroke2: "color-border-strong",
    colorNeutralStrokeAccessible: "color-border-strong",
    colorNeutralStrokeAccessibleHover: "color-border-strong",
    colorNeutralStrokeDisabled: "color-border-default",
    colorTransparentStroke: "color-border-default",
    strokeWidthThin: "border-width-thin",
    strokeWidthThick: "border-width-thick",

    // Focus
    colorStrokeFocus1: "color-surface-base",
    colorStrokeFocus2: "color-focus-ring",

    // Status
    colorPaletteGreenForeground1: "color-status-success",
    colorPaletteGreenBackground3: "color-status-success",
    colorPaletteYellowForeground1: "color-status-warning",
    colorPaletteYellowBackground3: "color-status-warning",
    colorPaletteRedForeground1: "color-status-danger",
    colorPaletteRedBackground3: "color-status-danger",
    colorPaletteBlueForeground2: "color-status-info",
    colorPaletteBlueBackground2: "color-status-info",

    // Border radius
    borderRadiusSmall: "radius-sm",
    borderRadiusMedium: "radius-md",
    borderRadiusLarge: "radius-lg",
    borderRadiusXLarge: "radius-xl",
    borderRadiusCircular: "radius-round",

    // Typography
    fontFamilyBase: "font-family-base",
    fontFamilyMonospace: "font-family-mono",
    fontSizeBase200: "font-size-xs",
    fontSizeBase300: "font-size-sm",
    fontSizeBase400: "font-size-md",
    fontSizeBase500: "font-size-lg",
    fontSizeBase600: "font-size-xl",
    fontWeightRegular: "font-weight-regular",
    fontWeightSemibold: "font-weight-semibold",
    fontWeightBold: "font-weight-bold",
    lineHeightBase200: "font-line-height-tight",
    lineHeightBase300: "font-line-height-normal",
    lineHeightBase400: "font-line-height-normal",
    lineHeightBase500: "font-line-height-normal",
    lineHeightBase600: "font-line-height-tight",

    // Spacing
    spacingHorizontalXXS: "spacing-xs",
    spacingHorizontalXS: "spacing-xs",
    spacingHorizontalS: "spacing-sm",
    spacingHorizontalM: "spacing-md",
    spacingHorizontalL: "spacing-lg",
    spacingHorizontalXL: "spacing-xl",
    spacingVerticalXXS: "spacing-xs",
    spacingVerticalXS: "spacing-xs",
    spacingVerticalS: "spacing-sm",
    spacingVerticalM: "spacing-md",
    spacingVerticalL: "spacing-lg",
    spacingVerticalXL: "spacing-xl",

    // Shadows
    shadow2: "shadow-sm",
    shadow4: "shadow-md",
    shadow8: "shadow-md",
    shadow16: "shadow-lg",
    shadow28: "shadow-lg",
    shadow64: "shadow-lg",

    // Duration
    durationFast: "duration-fast",
    durationNormal: "duration-normal",
    durationSlow: "duration-slow",
  };

  const lines = [
    fileHeader("Fluent UI v9 Theme Adapter"),
    "",
    `import type { Theme } from "@fluentui/react-components";`,
    "",
    "/**",
    " * A partial Fluent UI v9 Theme where every value is a CSS var()",
    " * reference into Rapid's global custom properties. Theme",
    " * switching is pure CSS (via data-theme attribute) with",
    " * zero JS overhead.",
    " */",
    "export const rapidFluentTheme: Partial<Theme> = {",
  ];

  for (const [fluentKey, tokenKey] of Object.entries(map)) {
    lines.push(`  ${fluentKey}: "${v(tokenKey)}",`);
  }

  lines.push("};", "");
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Fluent UI v9 — Provider.tsx
// ---------------------------------------------------------------------------

function buildProviderTSX() {
  return `${fileHeader("<RapidFluentProvider>")}

import React from "react";
import { FluentProvider } from "@fluentui/react-components";
import type { FluentProviderProps } from "@fluentui/react-components";
import { rapidFluentTheme } from "./index";

export type RapidFluentProviderProps = Omit<FluentProviderProps, "theme"> & {
  children: React.ReactNode;
};

/**
 * Drop-in replacement for FluentProvider that injects the Rapid
 * theme. Dark mode is driven by the \`data-theme\` attribute on
 * <html> or <body> — no JS context needed.
 */
export const RapidFluentProvider: React.FC<RapidFluentProviderProps> = ({
  children,
  ...rest
}) => {
  return (
    <FluentProvider theme={rapidFluentTheme as any} {...rest}>
      {children}
    </FluentProvider>
  );
};
`;
}

// ---------------------------------------------------------------------------
// Fluent UI v8 adapter — index.ts
//
// v8 uses createTheme() with IPalette / ISemanticColors / IEffects / IFontStyles.
// Values pass through mergeStyles → CSS, so var() strings resolve in the browser.
// We supply EVERY semantic color explicitly to bypass v8's internal colour
// derivation (which can't parse var() as hex).
// ---------------------------------------------------------------------------

function buildFluentV8Adapter() {
  const lines = [
    fileHeader("Fluent UI v8 Theme Adapter"),
    "",
    `import type { PartialTheme, IEffects, IFontStyles } from "@fluentui/react";`,
    "",
    "/**",
    " * Fluent UI v8 theme where every colour, radius, shadow, and font",
    " * value is a CSS var() reference into Rapid's global custom properties.",
    " *",
    " * Both this v8 theme and the sibling v9 adapter resolve to the SAME",
    " * --rapid-* CSS variables, so v8 and v9 controls rendered on the same",
    " * page stay in perfect visual sync.  Dark mode is driven by the",
    " * data-theme attribute on <html> — no JS context swap required.",
    " *",
    " * IMPORTANT: v8's createTheme() tries to derive semantic colours by",
    " * parsing palette hex values.  Because we pass var() strings, those",
    " * derivations produce warnings.  Every semantic colour slot is",
    " * therefore provided explicitly below, overriding the broken",
    " * derivations.  The resulting CSS is fully correct.",
    " */",
    "",
  ];

  // ---------- palette ----------

  const palette = {
    themePrimary:        "color-brand-primary",
    themeLighterAlt:     "color-surface-overlay",
    themeLighter:        "color-surface-overlay",
    themeLight:          "color-brand-tertiary",
    themeTertiary:       "color-brand-tertiary",
    themeSecondary:      "color-brand-secondary",
    themeDarkAlt:        "color-brand-secondary",
    themeDark:           "color-brand-secondary",
    themeDarker:         "color-brand-tertiary",

    neutralPrimary:      "color-text-primary",
    neutralDark:         "color-text-primary",
    neutralSecondary:    "color-text-secondary",
    neutralSecondaryAlt: "color-text-secondary",
    neutralTertiary:     "color-border-strong",
    neutralTertiaryAlt:  "color-border-default",
    neutralQuaternary:   "color-border-default",
    neutralQuaternaryAlt:"color-surface-overlay",
    neutralLight:        "color-surface-overlay",
    neutralLighter:      "color-surface-raised",
    neutralLighterAlt:   "color-surface-base",

    black:   "color-text-primary",
    white:   "color-surface-base",
    accent:  "color-brand-primary",

    red:        "color-status-danger",
    redDark:    "color-status-danger",
    green:      "color-status-success",
    greenDark:  "color-status-success",
    yellow:     "color-status-warning",
    yellowDark: "color-status-warning",
    yellowLight:"color-status-warning",
    orange:     "color-status-warning",
    orangeLight:"color-status-warning",
    blueMid:    "color-brand-primary",
    blue:       "color-brand-primary",
    blueDark:   "color-brand-secondary",
    blueLight:  "color-brand-tertiary",
    tealDark:   "color-brand-secondary",
    teal:       "color-brand-primary",
    tealLight:  "color-brand-tertiary",
    purpleDark: "color-brand-secondary",
    purple:     "color-brand-primary",
    purpleLight:"color-brand-tertiary",
    magentaDark:"color-brand-secondary",
    magenta:    "color-brand-primary",
    magentaLight:"color-brand-tertiary",
  };

  lines.push("export const rapidFluentV8Palette = {");
  for (const [slot, token] of Object.entries(palette)) {
    lines.push(`  ${slot}: "${v(token)}",`);
  }
  lines.push("} as const;", "");

  // ---------- semanticColors ----------

  const semantic = {
    // Body
    bodyBackground:              "color-surface-base",
    bodyBackgroundHovered:       "color-surface-overlay",
    bodyBackgroundChecked:       "color-surface-overlay",
    bodyFrameBackground:         "color-surface-base",
    bodyFrameDivider:            "color-border-default",
    bodyText:                    "color-text-primary",
    bodyTextChecked:             "color-text-primary",
    bodySubtext:                 "color-text-secondary",
    bodyStandoutBackground:      "color-surface-raised",
    bodyDivider:                 "color-border-default",

    // Disabled
    disabledBackground:          "color-surface-overlay",
    disabledText:                "color-text-secondary",
    disabledSubtext:             "color-border-default",
    disabledBodyText:            "color-text-secondary",
    disabledBodySubtext:         "color-border-default",

    // Focus
    focusBorder:                 "color-brand-primary",

    // Variant borders
    variantBorder:               "color-border-default",
    variantBorderHovered:        "color-border-strong",

    // Default button
    defaultStateBackground:      "color-surface-base",
    buttonBackground:            "color-surface-raised",
    buttonBackgroundHovered:     "color-surface-overlay",
    buttonBackgroundPressed:     "color-surface-overlay",
    buttonBackgroundChecked:     "color-surface-overlay",
    buttonBackgroundCheckedHovered: "color-surface-overlay",
    buttonBackgroundDisabled:    "color-surface-overlay",
    buttonBorder:                "color-border-default",
    buttonBorderDisabled:        "color-border-default",
    buttonText:                  "color-text-primary",
    buttonTextHovered:           "color-text-primary",
    buttonTextPressed:           "color-text-primary",
    buttonTextChecked:           "color-text-primary",
    buttonTextCheckedHovered:    "color-text-primary",
    buttonTextDisabled:          "color-text-secondary",

    // Primary button
    primaryButtonBackground:         "color-brand-primary",
    primaryButtonBackgroundHovered:  "color-brand-secondary",
    primaryButtonBackgroundPressed:  "color-brand-tertiary",
    primaryButtonBackgroundDisabled: "color-surface-overlay",
    primaryButtonBorder:             "color-brand-primary",
    primaryButtonText:               "color-text-on-brand",
    primaryButtonTextHovered:        "color-text-on-brand",
    primaryButtonTextPressed:        "color-text-on-brand",
    primaryButtonTextDisabled:       "color-text-secondary",

    // Action (link-style) button
    actionLink:                  "color-text-primary",
    actionLinkHovered:           "color-text-primary",

    // Link
    link:                        "color-brand-primary",
    linkHovered:                 "color-brand-secondary",

    // Input
    inputBorder:                 "color-border-default",
    inputBorderHovered:          "color-border-strong",
    inputBackground:             "color-surface-base",
    inputBackgroundChecked:      "color-brand-primary",
    inputBackgroundCheckedHovered: "color-brand-secondary",
    inputForegroundChecked:      "color-text-on-brand",
    inputFocusBorderAlt:         "color-brand-primary",
    inputText:                   "color-text-primary",
    inputTextHovered:            "color-text-primary",
    inputPlaceholderText:        "color-text-secondary",
    inputPlaceholderBackgroundChecked: "color-brand-secondary",
    inputIcon:                   "color-brand-primary",
    inputIconHovered:            "color-brand-secondary",
    inputIconDisabled:           "color-text-secondary",

    // Menu
    menuBackground:              "color-surface-base",
    menuDivider:                 "color-border-default",
    menuIcon:                    "color-brand-primary",
    menuHeader:                  "color-brand-primary",
    menuItemBackgroundHovered:   "color-surface-overlay",
    menuItemBackgroundPressed:   "color-surface-overlay",
    menuItemText:                "color-text-primary",
    menuItemTextHovered:         "color-text-primary",

    // List
    listBackground:              "color-surface-base",
    listText:                    "color-text-primary",
    listItemBackgroundHovered:   "color-surface-overlay",
    listItemBackgroundChecked:   "color-surface-overlay",
    listItemBackgroundCheckedHovered: "color-surface-overlay",
    listHeaderBackgroundHovered: "color-surface-overlay",
    listHeaderBackgroundPressed: "color-surface-overlay",

    // Status
    errorText:                   "color-status-danger",
    warningText:                 "color-status-warning",
    successText:                 "color-status-success",
    errorBackground:             "color-status-danger",
    warningBackground:           "color-status-warning",
    successBackground:           "color-status-success",
    warningHighlight:            "color-status-warning",
    blockingBackground:          "color-status-danger",

    // Selection
    accentButtonBackground:      "color-brand-primary",
    accentButtonText:            "color-text-on-brand",
    listTextColor:               "color-text-primary",

    // Card
    cardStandoutBackground:      "color-surface-raised",
    cardShadow:                  "shadow-md",
    cardShadowHovered:           "shadow-lg",
  };

  lines.push("export const rapidFluentV8SemanticColors = {");
  for (const [slot, token] of Object.entries(semantic)) {
    lines.push(`  ${slot}: "${v(token)}",`);
  }
  lines.push("} as const;", "");

  // ---------- effects ----------

  lines.push("export const rapidFluentV8Effects: Partial<IEffects> = {");
  lines.push(`  roundedCorner2: "${v("radius-sm")}",`);
  lines.push(`  roundedCorner4: "${v("radius-md")}",`);
  lines.push(`  roundedCorner6: "${v("radius-lg")}",`);
  lines.push(`  elevation4:  "${v("shadow-sm")}",`);
  lines.push(`  elevation8:  "${v("shadow-md")}",`);
  lines.push(`  elevation16: "${v("shadow-md")}",`);
  lines.push(`  elevation64: "${v("shadow-lg")}",`);
  lines.push("};", "");

  // ---------- fonts ----------

  lines.push("const fontBase = {");
  lines.push(`  fontFamily: "${v("font-family-base")}",`);
  lines.push("};", "");

  const fontMap = {
    tiny:        "font-size-xs",
    xSmall:      "font-size-xs",
    small:       "font-size-sm",
    smallPlus:   "font-size-sm",
    medium:      "font-size-md",
    mediumPlus:  "font-size-md",
    large:       "font-size-lg",
    xLarge:      "font-size-xl",
    xLargePlus:  "font-size-xl",
    xxLarge:     "font-size-2xl",
    xxLargePlus: "font-size-2xl",
    superLarge:  "font-size-2xl",
    mega:        "font-size-2xl",
  };

  lines.push("export const rapidFluentV8Fonts: Partial<IFontStyles> = {");
  for (const [slot, token] of Object.entries(fontMap)) {
    lines.push(`  ${slot}: { ...fontBase, fontSize: "${v(token)}" },`);
  }
  lines.push("};", "");

  // ---------- combined theme ----------

  lines.push("/**");
  lines.push(" * Complete v8 PartialTheme ready for <ThemeProvider> or loadTheme().");
  lines.push(" *");
  lines.push(" * Both v8 and v9 adapters resolve through identical --rapid-* CSS");
  lines.push(" * variables, so a page mixing v8 DetailsList and v9 Button will");
  lines.push(" * render with a single coherent palette and switch themes in unison.");
  lines.push(" */");
  lines.push("export const rapidFluentV8Theme: PartialTheme = {");
  lines.push("  palette: rapidFluentV8Palette as any,");
  lines.push("  semanticColors: rapidFluentV8SemanticColors as any,");
  lines.push("  effects: rapidFluentV8Effects as any,");
  lines.push("  fonts: rapidFluentV8Fonts as any,");
  lines.push("  isInverted: false,");
  lines.push("};", "");

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Fluent UI v8 — Provider.tsx
// ---------------------------------------------------------------------------

function buildFluentV8ProviderTSX() {
  return `${fileHeader("<RapidFluentV8Provider>")}

import React from "react";
import { ThemeProvider, createTheme } from "@fluentui/react";
import type { PartialTheme } from "@fluentui/react";
import { rapidFluentV8Theme } from "./index";

export interface RapidFluentV8ProviderProps {
  children: React.ReactNode;
  /**
   * Optional overrides merged on top of the Rapid v8 theme.
   * Use this for per-section tweaks without breaking the
   * Rapid token contract.
   */
  themeOverrides?: PartialTheme;
  /**
   * When true, applies the theme globally via loadTheme() in
   * addition to the React context.  Useful for legacy code that
   * reads the global theme singleton.
   */
  applyGlobally?: boolean;
}

/**
 * Drop-in Fluent UI v8 ThemeProvider wired to Rapid tokens.
 *
 * Use alongside <RapidFluentProvider> (v9) in the same tree — both
 * resolve through the same --rapid-* CSS variables, so v8 DetailsList
 * and v9 Button stay visually synchronised across light/dark.
 *
 * Dark mode: set \`data-theme="dark"\` on <html>.  No JS context
 * swap is needed; the CSS custom properties update and both
 * v8 and v9 controls repaint in unison.
 *
 * \`\`\`tsx
 * // Mixed v8 + v9 page
 * <RapidFluentV8Provider>
 *   <DetailsList ... />        {/* v8 */}
 *   <RapidFluentProvider>
 *     <Button>Save</Button>    {/* v9 */}
 *   </RapidFluentProvider>
 * </RapidFluentV8Provider>
 * \`\`\`
 */
export const RapidFluentV8Provider: React.FC<RapidFluentV8ProviderProps> = ({
  children,
  themeOverrides,
  applyGlobally = false,
}) => {
  const merged = themeOverrides
    ? createTheme({ ...rapidFluentV8Theme, ...themeOverrides })
    : createTheme(rapidFluentV8Theme);

  if (applyGlobally) {
    // Side-effect: also push to the global singleton so non-React
    // code (loadTheme consumers, mergeStyles) picks it up.
    try {
      const { loadTheme } = require("@fluentui/react");
      loadTheme(merged);
    } catch {
      // loadTheme unavailable — ThemeProvider context is still applied.
    }
  }

  return <ThemeProvider theme={merged}>{children}</ThemeProvider>;
};
`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CSS VARIABLE OVERRIDE ADAPTERS
//  Load these stylesheets AFTER the target library's own CSS so that
//  the cascade resolves the Rapid var() references.
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Bootstrap 5.3+
// ---------------------------------------------------------------------------

function buildBootstrap5Adapter() {
  return `${fileHeader("Bootstrap 5.3+ Adapter", [
    "Overrides Bootstrap's native CSS custom properties with Rapid",
    "var() references. Load this stylesheet AFTER Bootstrap's CSS.",
    "Dark mode: set data-theme=\"dark\" on <html> — Bootstrap's",
    "[data-bs-theme] attribute is NOT required.",
  ])}

:root,
[data-bs-theme="light"] {
  /* --- Brand / Action --- */
  --bs-primary: ${v("color-brand-primary")};
  --bs-primary-rgb: none;
  --bs-secondary: ${v("color-brand-secondary")};
  --bs-info: ${v("color-status-info")};
  --bs-light: ${v("color-surface-raised")};
  --bs-dark: ${v("color-text-primary")};
  --bs-link-color: ${v("color-text-link")};
  --bs-link-hover-color: ${v("color-text-link-hover")};

  /* --- Surfaces --- */
  --bs-body-bg: ${v("color-surface-base")};
  --bs-secondary-bg: ${v("color-surface-raised")};
  --bs-tertiary-bg: ${v("color-surface-overlay")};

  /* --- Text --- */
  --bs-body-color: ${v("color-text-primary")};
  --bs-secondary-color: ${v("color-text-secondary")};
  --bs-emphasis-color: ${v("color-text-primary")};
  --bs-heading-color: ${v("color-text-primary")};

  /* --- Borders --- */
  --bs-border-color: ${v("color-border-default")};

  /* --- Status --- */
  --bs-success: ${v("color-status-success")};
  --bs-warning: ${v("color-status-warning")};
  --bs-danger: ${v("color-status-danger")};

  /* --- Typography --- */
  --bs-body-font-family: ${v("font-family-base")};
  --bs-body-font-size: ${v("font-size-md")};
  --bs-font-sans-serif: ${v("font-family-base")};
  --bs-font-monospace: ${v("font-family-mono")};

  /* --- Border Radii --- */
  --bs-border-radius: ${v("radius-md")};
  --bs-border-radius-sm: ${v("radius-sm")};
  --bs-border-radius-lg: ${v("radius-lg")};
  --bs-border-radius-xl: ${v("radius-xl")};
  --bs-border-radius-pill: ${v("radius-round")};

  /* --- Shadows --- */
  --bs-box-shadow: ${v("shadow-md")};
  --bs-box-shadow-sm: ${v("shadow-sm")};
  --bs-box-shadow-lg: ${v("shadow-lg")};
}

[data-bs-theme="dark"] {
  --bs-body-bg: ${v("color-surface-base")};
  --bs-body-color: ${v("color-text-primary")};
  --bs-emphasis-color: ${v("color-text-primary")};
  --bs-secondary-color: ${v("color-text-secondary")};
  --bs-tertiary-bg: ${v("color-surface-overlay")};
  --bs-border-color: ${v("color-border-default")};
}
`;
}

// ---------------------------------------------------------------------------
// AG Grid
// ---------------------------------------------------------------------------

function buildAGGridAdapter() {
  return `${fileHeader("AG Grid Adapter", [
    "Overrides AG Grid's CSS custom properties with Rapid var() references.",
    "Works with Community and Enterprise editions, all bundled themes",
    "(Alpine, Balham, Material, Quartz). Load AFTER ag-grid CSS.",
  ])}

.ag-theme-alpine,
.ag-theme-alpine-dark,
.ag-theme-balham,
.ag-theme-balham-dark,
.ag-theme-material,
.ag-theme-quartz,
.ag-theme-quartz-dark,
:root {
  /* --- Chrome / Surfaces --- */
  --ag-background-color: ${v("color-surface-base")};
  --ag-header-background-color: ${v("color-surface-raised")};
  --ag-control-panel-background-color: ${v("color-surface-raised")};
  --ag-subheader-background-color: ${v("color-surface-overlay")};
  --ag-odd-row-background-color: ${v("color-surface-overlay")};
  --ag-row-hover-color: ${v("color-surface-overlay")};
  --ag-modal-overlay-background-color: ${v("color-surface-overlay")};
  --ag-tooltip-background-color: ${v("color-surface-raised")};

  /* --- Text --- */
  --ag-foreground-color: ${v("color-text-primary")};
  --ag-header-foreground-color: ${v("color-text-primary")};
  --ag-data-color: ${v("color-text-primary")};
  --ag-secondary-foreground-color: ${v("color-text-secondary")};

  /* --- Borders --- */
  --ag-border-color: ${v("color-border-default")};
  --ag-row-border-color: ${v("color-border-default")};
  --ag-secondary-border-color: ${v("color-border-strong")};

  /* --- Selection & Focus --- */
  --ag-selected-row-background-color: color-mix(in srgb, ${v("color-brand-primary")} 15%, ${v("color-surface-base")});
  --ag-range-selection-background-color: color-mix(in srgb, ${v("color-brand-primary")} 15%, ${v("color-surface-base")});
  --ag-range-selection-border-color: ${v("color-brand-secondary")};
  --ag-input-focus-border-color: ${v("color-brand-primary")};
  --ag-checkbox-checked-color: ${v("color-brand-primary")};
  --ag-column-hover-color: ${v("color-surface-overlay")};

  /* --- Status --- */
  --ag-invalid-color: ${v("color-status-danger")};

  /* --- Typography --- */
  --ag-font-family: ${v("font-family-base")};
  --ag-font-size: ${v("font-size-md")};

  /* --- Spacing --- */
  --ag-grid-size: ${v("spacing-xs")};
  --ag-cell-horizontal-padding: ${v("spacing-sm")};
  --ag-row-height: calc(${v("spacing-md")} * 2 + ${v("font-size-md")});
  --ag-header-height: calc(${v("spacing-md")} * 2 + ${v("font-size-md")});

  /* --- Borders / Radii --- */
  --ag-border-radius: ${v("radius-md")};
  --ag-card-radius: ${v("radius-lg")};
  --ag-wrapper-border-radius: ${v("radius-md")};

  /* --- Shadows --- */
  --ag-card-shadow: ${v("shadow-md")};
  --ag-popup-shadow: ${v("shadow-lg")};
}
`;
}

// ---------------------------------------------------------------------------
// FullCalendar v6
// ---------------------------------------------------------------------------

function buildFullCalendarAdapter() {
  return `${fileHeader("FullCalendar v6 Adapter", [
    "Overrides FullCalendar's CSS custom properties with Rapid var()",
    "references. Load this stylesheet AFTER FullCalendar's CSS.",
    "Supports all view types (dayGrid, timeGrid, list, multiMonth).",
  ])}

:root {
  /* --- Page / Surfaces --- */
  --fc-page-bg-color: ${v("color-surface-base")};
  --fc-neutral-bg-color: ${v("color-surface-raised")};
  --fc-neutral-text-color: ${v("color-text-secondary")};

  /* --- Borders --- */
  --fc-border-color: ${v("color-border-default")};

  /* --- Buttons (toolbar) --- */
  --fc-button-bg-color: ${v("color-brand-primary")};
  --fc-button-border-color: ${v("color-brand-primary")};
  --fc-button-text-color: ${v("color-text-on-brand")};
  --fc-button-hover-bg-color: ${v("color-brand-secondary")};
  --fc-button-hover-border-color: ${v("color-brand-secondary")};
  --fc-button-active-bg-color: ${v("color-brand-tertiary")};
  --fc-button-active-border-color: ${v("color-brand-tertiary")};

  /* --- Events --- */
  --fc-event-bg-color: ${v("color-brand-primary")};
  --fc-event-border-color: ${v("color-brand-secondary")};
  --fc-event-text-color: ${v("color-text-on-brand")};
  --fc-event-selected-overlay-color: rgba(0, 0, 0, 0.15);

  /* --- Today / Now --- */
  --fc-today-bg-color: ${v("color-surface-overlay")};
  --fc-now-indicator-color: ${v("color-status-danger")};

  /* --- List View --- */
  --fc-list-event-hover-bg-color: ${v("color-surface-overlay")};

  /* --- Day / Non-business --- */
  --fc-non-business-color: ${v("color-surface-overlay")};
  --fc-highlight-color: ${v("color-surface-overlay")};
  --fc-more-link-bg-color: ${v("color-surface-raised")};
  --fc-more-link-text-color: ${v("color-brand-primary")};

  /* --- Typography (applied via descendant selectors) --- */
  --fc-small-font-size: ${v("font-size-sm")};
}

.fc {
  font-family: ${v("font-family-base")};
  font-size: ${v("font-size-md")};
}
`;
}

// ---------------------------------------------------------------------------
// Telerik / Kendo UI
// ---------------------------------------------------------------------------

function buildTelerikKendoAdapter() {
  return `${fileHeader("Telerik / Kendo UI Adapter", [
    "Overrides Kendo UI's --kendo-* CSS custom properties with Rapid",
    "var() references. Compatible with Kendo UI for jQuery, Angular,",
    "React, and Vue. Load AFTER Kendo's theme CSS.",
  ])}

:root {
  /* --- Brand / Primary --- */
  --kendo-color-primary: ${v("color-brand-primary")};
  --kendo-color-primary-hover: ${v("color-brand-secondary")};
  --kendo-color-primary-active: ${v("color-brand-tertiary")};
  --kendo-color-on-primary: ${v("color-text-on-brand")};
  --kendo-color-primary-emphasis: ${v("color-brand-secondary")};

  /* --- Surfaces --- */
  --kendo-color-surface: ${v("color-surface-base")};
  --kendo-color-surface-alt: ${v("color-surface-raised")};
  --kendo-color-app-surface: ${v("color-surface-base")};
  --kendo-color-on-app-surface: ${v("color-text-primary")};
  --kendo-color-base: ${v("color-surface-raised")};
  --kendo-color-on-base: ${v("color-text-primary")};
  --kendo-color-base-hover: ${v("color-surface-overlay")};
  --kendo-color-base-active: ${v("color-surface-overlay")};
  --kendo-color-subtle: ${v("color-text-secondary")};

  /* --- Borders --- */
  --kendo-color-border: ${v("color-border-default")};
  --kendo-color-border-alt: ${v("color-border-strong")};

  /* --- Status --- */
  --kendo-color-success: ${v("color-status-success")};
  --kendo-color-warning: ${v("color-status-warning")};
  --kendo-color-error: ${v("color-status-danger")};

  /* --- Typography --- */
  --kendo-font-family: ${v("font-family-base")};
  --kendo-font-family-monospace: ${v("font-family-mono")};
  --kendo-font-size: ${v("font-size-md")};
  --kendo-font-size-sm: ${v("font-size-sm")};
  --kendo-font-size-lg: ${v("font-size-lg")};

  /* --- Spacing --- */
  --kendo-spacing-1: ${v("spacing-xs")};
  --kendo-spacing-2: ${v("spacing-sm")};
  --kendo-spacing-4: ${v("spacing-md")};
  --kendo-spacing-6: ${v("spacing-lg")};
  --kendo-spacing-8: ${v("spacing-xl")};

  /* --- Border Radii --- */
  --kendo-border-radius-sm: ${v("radius-sm")};
  --kendo-border-radius-md: ${v("radius-md")};
  --kendo-border-radius-lg: ${v("radius-lg")};

  /* --- Shadows --- */
  --kendo-box-shadow-depth-1: ${v("shadow-sm")};
  --kendo-box-shadow-depth-2: ${v("shadow-md")};
  --kendo-box-shadow-depth-3: ${v("shadow-lg")};
}
`;
}

// ---------------------------------------------------------------------------
// SweetAlert2
// ---------------------------------------------------------------------------

function buildSweetAlert2Adapter() {
  return `${fileHeader("SweetAlert2 Adapter", [
    "Overrides SweetAlert2's --swal2-* CSS custom properties with",
    "Rapid var() references. Load AFTER sweetalert2/dist/sweetalert2.css.",
    "Dark mode is inherited automatically from [data-theme=\"dark\"].",
  ])}

:root {
  /* --- Backdrop / Modal --- */
  --swal2-backdrop: rgba(0, 0, 0, 0.4);
  --swal2-background: ${v("color-surface-base")};
  --swal2-color: ${v("color-text-primary")};
  --swal2-title-color: ${v("color-text-primary")};
  --swal2-html-container-color: ${v("color-text-secondary")};

  /* --- Inputs --- */
  --swal2-input-color: ${v("color-text-primary")};
  --swal2-input-background: ${v("color-surface-base")};
  --swal2-input-border-color: ${v("color-border-default")};
  --swal2-input-border-focus-color: ${v("color-brand-primary")};

  /* --- Buttons --- */
  --swal2-confirm-button-background: ${v("color-brand-primary")};
  --swal2-confirm-button-color: ${v("color-text-on-brand")};
  --swal2-confirm-button-border: 0;
  --swal2-deny-button-background: ${v("color-status-danger")};
  --swal2-deny-button-color: ${v("color-text-on-brand")};
  --swal2-cancel-button-background: ${v("color-surface-raised")};
  --swal2-cancel-button-color: ${v("color-text-primary")};

  /* --- Close / Footer --- */
  --swal2-close-button-color: ${v("color-text-secondary")};
  --swal2-close-button-hover-color: ${v("color-status-danger")};
  --swal2-footer-border-color: ${v("color-border-default")};
  --swal2-timer-progress-bar-background: ${v("color-brand-primary")};

  /* --- Toast --- */
  --swal2-toast-background: ${v("color-surface-raised")};
  --swal2-toast-color: ${v("color-text-primary")};
}

.swal2-popup {
  font-family: ${v("font-family-base")};
  font-size: ${v("font-size-md")};
  border-radius: ${v("radius-lg")};
  box-shadow: ${v("shadow-lg")};
}

.swal2-confirm,
.swal2-deny,
.swal2-cancel {
  border-radius: ${v("radius-md")} !important;
  font-weight: ${v("font-weight-semibold")};
}
`;
}

// ---------------------------------------------------------------------------
// DevExtreme
// ---------------------------------------------------------------------------

function buildDevExtremeAdapter() {
  return `${fileHeader("DevExtreme Adapter", [
    "Overrides DevExtreme's CSS custom properties with Rapid var()",
    "references. Compatible with the Generic, Material, and Fluent",
    "themes. Load AFTER the DevExtreme theme CSS.",
  ])}

:root {
  /* --- Brand / Accents --- */
  --dx-color-primary: ${v("color-brand-primary")};
  --dx-color-primary-container: ${v("color-brand-secondary")};
  --dx-color-primary-contrast: ${v("color-text-on-brand")};

  /* --- Surfaces --- */
  --dx-color-bg: ${v("color-surface-base")};
  --dx-color-bg-contrast: ${v("color-text-primary")};
  --dx-color-surface: ${v("color-surface-raised")};

  /* --- Text --- */
  --dx-color-text: ${v("color-text-primary")};
  --dx-color-text-secondary: ${v("color-text-secondary")};

  /* --- Borders --- */
  --dx-color-border: ${v("color-border-default")};

  /* --- Status --- */
  --dx-color-danger: ${v("color-status-danger")};
  --dx-color-success: ${v("color-status-success")};
  --dx-color-warning: ${v("color-status-warning")};

  /* --- Typography --- */
  --dx-font-family: ${v("font-family-base")};
  --dx-font-size: ${v("font-size-md")};
  --dx-font-size-small: ${v("font-size-sm")};
  --dx-font-size-heading: ${v("font-size-xl")};

  /* --- Geometry --- */
  --dx-border-radius: ${v("radius-md")};
  --dx-border-radius-small: ${v("radius-sm")};
  --dx-border-radius-large: ${v("radius-lg")};
}

.dx-widget {
  font-family: ${v("font-family-base")};
}

.dx-card {
  box-shadow: ${v("shadow-md")};
  border-radius: ${v("radius-lg")};
}
`;
}

// ---------------------------------------------------------------------------
// PrimeReact / PrimeFaces / PrimeVue
// ---------------------------------------------------------------------------

function buildPrimeReactAdapter() {
  return `${fileHeader("PrimeReact / PrimeFaces / PrimeVue Adapter", [
    "Overrides the PrimeOne CSS custom properties used by PrimeReact,",
    "PrimeFaces, PrimeVue, and PrimeNG. Compatible with all PrimeOne",
    "themes (Lara, Aura, Nora, etc.). Load AFTER the Prime theme CSS.",
  ])}

:root {
  /* --- Brand / Primary --- */
  --primary-color: ${v("color-brand-primary")};
  --primary-color-text: ${v("color-text-on-brand")};
  --primary-dark-color: ${v("color-brand-secondary")};
  --primary-darker-color: ${v("color-brand-tertiary")};
  --highlight-bg: ${v("color-brand-primary")};
  --highlight-text-color: ${v("color-text-on-brand")};

  /* --- Surfaces --- */
  --surface-ground: ${v("color-surface-base")};
  --surface-section: ${v("color-surface-base")};
  --surface-card: ${v("color-surface-raised")};
  --surface-overlay: ${v("color-surface-overlay")};
  --surface-border: ${v("color-border-default")};
  --surface-hover: ${v("color-surface-overlay")};
  --surface-0: ${v("color-surface-base")};
  --surface-50: ${v("color-surface-base")};
  --surface-100: ${v("color-surface-raised")};
  --surface-200: ${v("color-surface-overlay")};

  /* --- Text --- */
  --text-color: ${v("color-text-primary")};
  --text-color-secondary: ${v("color-text-secondary")};

  /* --- Focus --- */
  --focus-ring: 0 0 0 2px ${v("color-surface-base")}, 0 0 0 4px ${v("color-brand-primary")};
  --maskbg: rgba(0, 0, 0, 0.4);

  /* --- Typography --- */
  --font-family: ${v("font-family-base")};

  /* --- Geometry --- */
  --border-radius: ${v("radius-md")};
  --inline-spacing: ${v("spacing-sm")};
  --surface-border-radius: ${v("radius-md")};
}
`;
}

// ---------------------------------------------------------------------------
// Bryntum Grid / Scheduler / Gantt
// ---------------------------------------------------------------------------

function buildBryntumAdapter() {
  return `${fileHeader("Bryntum Adapter", [
    "Maps Bryntum's internal CSS custom properties to Rapid",
    "variables so the grid inherits the active theme.",
    "Include this stylesheet AFTER Bryntum's own CSS.",
  ])}

.b-theme-material,
.b-theme-classic,
.b-theme-classic-light,
.b-theme-classic-dark,
.b-theme-stockholm,
:root {
  /* --- Surface / Chrome --- */
  --b-grid-header-bg: ${v("color-surface-raised")};
  --b-grid-header-color: ${v("color-text-primary")};
  --b-grid-row-bg: ${v("color-surface-base")};
  --b-grid-row-alt-bg: ${v("color-surface-overlay")};
  --b-grid-cell-color: ${v("color-text-primary")};
  --b-grid-border-color: ${v("color-border-default")};

  /* --- Selection & Focus --- */
  --b-grid-selection-bg: ${v("color-brand-primary")};
  --b-grid-selection-color: ${v("color-text-on-brand")};
  --b-grid-focused-cell-border-color: ${v("color-brand-primary")};

  /* --- Scheduler / Gantt specifics --- */
  --b-sch-event-color: ${v("color-text-on-brand")};
  --b-sch-event-bg: ${v("color-brand-primary")};
  --b-sch-event-selected-bg: ${v("color-brand-secondary")};
  --b-gantt-task-color: ${v("color-brand-primary")};
  --b-gantt-milestone-color: ${v("color-brand-secondary")};

  /* --- Toolbar / Panel --- */
  --b-toolbar-background-color: ${v("color-surface-raised")};
  --b-panel-background-color: ${v("color-surface-base")};
  --b-panel-border-color: ${v("color-border-default")};

  /* --- Typography --- */
  --b-font-family: ${v("font-family-base")};
  --b-font-size: ${v("font-size-md")};

  /* --- Spacing --- */
  --b-grid-cell-padding: ${v("spacing-sm")};

  /* --- Shadows --- */
  --b-panel-shadow: ${v("shadow-md")};
  --b-floating-shadow: ${v("shadow-lg")};
}
`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CSS CLASS OVERRIDE ADAPTERS
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Highcharts — Styled Mode (CSS)
// ---------------------------------------------------------------------------

function buildHighchartsStyledAdapter() {
  return `${fileHeader("Highcharts Styled Mode Adapter", [
    "Targets Highcharts' SVG CSS classes to apply Rapid tokens.",
    "Requires Highcharts \"styled mode\" (import highcharts/css instead",
    "of the default build). Load this stylesheet AFTER Highcharts CSS.",
    "For non-styled mode, use the JS bridge (highcharts.ts) instead.",
  ])}

:root {
  --rapid-chart-color-0: ${v("color-brand-primary")};
  --rapid-chart-color-1: ${v("color-status-success")};
  --rapid-chart-color-2: ${v("color-status-warning")};
  --rapid-chart-color-3: ${v("color-status-danger")};
  --rapid-chart-color-4: ${v("color-brand-secondary")};
  --rapid-chart-color-5: ${v("color-brand-tertiary")};
}

/* --- Chart Background --- */
.highcharts-background {
  fill: ${v("color-surface-base")};
}

/* --- Title / Subtitle --- */
.highcharts-title {
  fill: ${v("color-text-primary")} !important;
  font-family: ${v("font-family-base")};
  font-size: ${v("font-size-xl")};
  font-weight: ${v("font-weight-semibold")};
}

.highcharts-subtitle {
  fill: ${v("color-text-secondary")} !important;
  font-family: ${v("font-family-base")};
}

/* --- Axis --- */
.highcharts-axis-labels text {
  fill: ${v("color-text-secondary")} !important;
  font-family: ${v("font-family-base")};
  font-size: ${v("font-size-sm")};
}

.highcharts-axis-title {
  fill: ${v("color-text-secondary")} !important;
  font-family: ${v("font-family-base")};
}

.highcharts-axis-line {
  stroke: ${v("color-border-default")};
}

.highcharts-grid-line {
  stroke: ${v("color-border-default")};
}

.highcharts-tick {
  stroke: ${v("color-border-default")};
}

/* --- Series palette --- */
.highcharts-color-0 { fill: var(--rapid-chart-color-0); stroke: var(--rapid-chart-color-0); }
.highcharts-color-1 { fill: var(--rapid-chart-color-1); stroke: var(--rapid-chart-color-1); }
.highcharts-color-2 { fill: var(--rapid-chart-color-2); stroke: var(--rapid-chart-color-2); }
.highcharts-color-3 { fill: var(--rapid-chart-color-3); stroke: var(--rapid-chart-color-3); }
.highcharts-color-4 { fill: var(--rapid-chart-color-4); stroke: var(--rapid-chart-color-4); }
.highcharts-color-5 { fill: var(--rapid-chart-color-5); stroke: var(--rapid-chart-color-5); }

/* --- Legend --- */
.highcharts-legend-item text {
  fill: ${v("color-text-primary")} !important;
  font-family: ${v("font-family-base")};
}

/* --- Tooltip --- */
.highcharts-tooltip-box {
  fill: ${v("color-surface-raised")};
  stroke: ${v("color-border-default")};
}

.highcharts-tooltip text {
  fill: ${v("color-text-primary")} !important;
  font-family: ${v("font-family-base")};
  font-size: ${v("font-size-sm")};
}

/* --- Data Labels --- */
.highcharts-data-label text {
  fill: ${v("color-text-primary")} !important;
  font-family: ${v("font-family-base")};
  font-size: ${v("font-size-sm")};
}

/* --- Credits --- */
.highcharts-credits {
  fill: ${v("color-text-secondary")} !important;
  font-size: ${v("font-size-xs")};
}

/* --- Scrollbar / Navigator --- */
.highcharts-scrollbar-track-background {
  fill: ${v("color-surface-overlay")};
}

.highcharts-scrollbar-button {
  fill: ${v("color-surface-raised")};
  stroke: ${v("color-border-default")};
}
`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PLATFORM BRIDGE ADAPTERS
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// SharePoint Framework (SPFx)
// ---------------------------------------------------------------------------

function buildSPFxAdapter() {
  return `${fileHeader("SharePoint Framework (SPFx) Adapter", [
    "Overrides SPFx theme slots with Rapid var() references so that",
    "SPFx web parts and extensions inherit the Rapid theme.",
    "Load AFTER SharePoint's own theme CSS. Rapid is the authority;",
    "SPFx theme slots become pass-through aliases.",
  ])}

:root {
  /* --- SPFx Semantic Slots → Rapid mapping --- */
  --themePrimary: ${v("color-brand-primary")};
  --themeLighterAlt: ${v("color-surface-overlay")};
  --themeLighter: ${v("color-surface-overlay")};
  --themeLight: ${v("color-brand-tertiary")};
  --themeTertiary: ${v("color-brand-tertiary")};
  --themeSecondary: ${v("color-brand-secondary")};
  --themeDarkAlt: ${v("color-brand-secondary")};
  --themeDark: ${v("color-brand-secondary")};
  --themeDarker: ${v("color-brand-tertiary")};

  /* --- Neutral palette --- */
  --neutralLighterAlt: ${v("color-surface-base")};
  --neutralLighter: ${v("color-surface-raised")};
  --neutralLight: ${v("color-surface-overlay")};
  --neutralQuaternaryAlt: ${v("color-surface-overlay")};
  --neutralQuaternary: ${v("color-border-default")};
  --neutralTertiaryAlt: ${v("color-border-default")};
  --neutralTertiary: ${v("color-border-strong")};
  --neutralSecondary: ${v("color-text-secondary")};
  --neutralPrimaryAlt: ${v("color-text-secondary")};
  --neutralPrimary: ${v("color-text-primary")};
  --neutralDark: ${v("color-text-primary")};
  --black: ${v("color-text-primary")};
  --white: ${v("color-surface-base")};

  /* --- Semantic Mapping --- */
  --bodyBackground: ${v("color-surface-base")};
  --bodyText: ${v("color-text-primary")};
  --bodySubtext: ${v("color-text-secondary")};
  --link: ${v("color-brand-primary")};
  --linkHovered: ${v("color-brand-secondary")};
  --inputBorder: ${v("color-border-default")};
  --inputBorderHovered: ${v("color-border-strong")};
  --inputBackground: ${v("color-surface-base")};
  --inputForeground: ${v("color-text-primary")};
  --inputFocusBorderAlt: ${v("color-brand-primary")};
  --errorText: ${v("color-status-danger")};
  --warningText: ${v("color-status-warning")};
  --successText: ${v("color-status-success")};

  /* --- Typography --- */
  --fontFamily: ${v("font-family-base")};
}
`;
}

// ---------------------------------------------------------------------------
// Power Apps PCF Theme Bridge (TypeScript)
// ---------------------------------------------------------------------------

function buildPCFThemeBridge() {
  return `${fileHeader("Power Apps PCF Theme Bridge").replace(/\/\*/g, "//").replace(/\*\//g, "//").replace(/ \* /g, "// ")}

/**
 * Bridge utility for Power Apps Component Framework (PCF) controls.
 *
 * PCF controls render inside a container managed by the platform.
 * This bridge ensures Rapid CSS variables are available inside
 * the control's DOM scope, regardless of whether global.css is
 * loaded at the page level.
 *
 * Usage in your PCF control's init() or updateView():
 *
 *   import { injectRapidTheme, readRapidToken } from "./pcf-theme-bridge";
 *
 *   public init(context: ComponentFramework.Context<IInputs>,
 *               container: HTMLDivElement): void {
 *     injectRapidTheme(container);
 *   }
 */

const RAPID_GLOBAL_CSS_ID = "rapid-design-system-tokens";

/**
 * Injects Rapid's global.css into the document if it isn't already
 * present. Also propagates the data-theme attribute from the host
 * page into the control's scope.
 *
 * @param container - The PCF control's container element
 * @param cssHref   - Path or URL to global.css (auto-detected from
 *                    the PCF bundle if omitted)
 */
export function injectRapidTheme(
  container: HTMLElement,
  cssHref?: string,
): void {
  const doc = container.ownerDocument;

  if (!doc.getElementById(RAPID_GLOBAL_CSS_ID)) {
    const href = cssHref ?? detectCSSPath(container);
    if (/^(https?:\\/\\/|javascript:|data:)/i.test(href) && !href.startsWith(location.origin)) {
      console.warn("[RDS] Blocked cross-origin cssHref:", href);
      return;
    }
    const link = doc.createElement("link");
    link.id = RAPID_GLOBAL_CSS_ID;
    link.rel = "stylesheet";
    link.href = href;
    doc.head.appendChild(link);
  }

  syncThemeAttribute(doc);
}

/**
 * Reads a single Rapid CSS variable's computed value from the DOM.
 * Useful for imperative rendering (Canvas, SVG) inside a PCF control.
 *
 * @param token - Token key WITHOUT the --rapid- prefix (e.g. "color-brand-primary")
 * @param el    - Reference element for getComputedStyle (defaults to documentElement)
 */
export function readRapidToken(token: string, el?: Element): string {
  const target = el ?? document.documentElement;
  return getComputedStyle(target).getPropertyValue(\`--rapid-\${token}\`).trim();
}

/**
 * Reads multiple tokens in one shot. Returns a plain object
 * keyed by the input token names.
 */
export function readRapidTokens(
  tokens: string[],
  el?: Element,
): Record<string, string> {
  const target = el ?? document.documentElement;
  const styles = getComputedStyle(target);
  const result: Record<string, string> = Object.create(null);
  for (const t of tokens) {
    if (t === "__proto__" || t === "constructor" || t === "prototype") continue;
    result[t] = styles.getPropertyValue(\`--rapid-\${t}\`).trim();
  }
  return result;
}

/**
 * Syncs the active theme to the \`data-theme\` attribute on both
 * <html> and the control's container, enabling dark mode inside
 * the PCF shadow scope when the host page theme changes.
 */
export function syncThemeAttribute(doc: Document): void {
  const root = doc.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const currentTheme = root.getAttribute("data-theme");

  if (!currentTheme && prefersDark) {
    root.setAttribute("data-theme", "dark");
  }
}

/**
 * Resolves the path to global.css relative to the PCF control bundle.
 * Falls back to a CDN-friendly path convention.
 */
function detectCSSPath(container: HTMLElement): string {
  const scripts = container.ownerDocument.querySelectorAll("script[src]");
  for (const s of scripts) {
    const src = (s as HTMLScriptElement).src;
    if (src.includes("rapid-design-system") || src.includes("rds")) {
      const base = src.substring(0, src.lastIndexOf("/"));
      return \`\${base}/global.css\`;
    }
  }
  return "global.css";
}
`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  JAVASCRIPT BRIDGE ADAPTERS
//  For canvas-based and imperative libraries that cannot consume CSS vars
//  directly. These read the computed values at runtime.
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Shared CSS Variables Bridge Utility
// ---------------------------------------------------------------------------

function buildCSSVarsBridge() {
  return `${fileHeader("CSS Variables Bridge Utility").replace(/\/\*/g, "//").replace(/\*\//g, "//").replace(/ \* /g, "// ")}

/**
 * Low-level utility for canvas / imperative libraries (Chart.js,
 * Highcharts, D3, etc.) that need resolved token values rather
 * than var() references.
 *
 * Import once, call from any adapter:
 *
 *   import { token, tokens, palette } from "./_css-vars-bridge";
 *
 *   const bg = token("color-surface-base"); // "#ffffff"
 */

/**
 * Read a single Rapid token's computed value.
 * @param name Token key WITHOUT the --rapid- prefix.
 * @param el   Optional reference element (defaults to <html>).
 */
export function token(name: string, el?: Element): string {
  const target = el ?? document.documentElement;
  return getComputedStyle(target).getPropertyValue(\`--rapid-\${name}\`).trim();
}

/**
 * Read multiple tokens in one call.  Returns an object keyed by
 * the input names.
 */
export function tokens(
  names: string[],
  el?: Element,
): Record<string, string> {
  const target = el ?? document.documentElement;
  const styles = getComputedStyle(target);
  const out: Record<string, string> = Object.create(null);
  for (const n of names) {
    if (n === "__proto__" || n === "constructor" || n === "prototype") continue;
    out[n] = styles.getPropertyValue(\`--rapid-\${n}\`).trim();
  }
  return out;
}

/**
 * Returns a ready-to-use colour palette array suitable for chart
 * series, legends, etc.  Order is intentionally high-contrast for
 * accessibility.
 */
export function palette(el?: Element): string[] {
  return [
    token("color-brand-primary", el),
    token("color-status-success", el),
    token("color-status-warning", el),
    token("color-status-danger", el),
    token("color-brand-secondary", el),
    token("color-brand-tertiary", el),
  ];
}

/**
 * Parse a token value as a number (strips "px", "rem", etc.).
 * Useful for canvas APIs that expect numeric dimensions.
 */
export function tokenNumeric(name: string, el?: Element): number {
  return parseFloat(token(name, el)) || 0;
}

/**
 * Subscribes to theme changes (data-theme attribute mutations).
 * The callback fires whenever the resolved token values change,
 * letting canvas libraries re-paint.
 *
 * @returns A cleanup function to disconnect the observer.
 */
export function onThemeChange(callback: () => void): () => void {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === "data-theme") {
        callback();
        return;
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  return () => observer.disconnect();
}
`;
}

// ---------------------------------------------------------------------------
// Chart.js Adapter
// ---------------------------------------------------------------------------

function buildChartJSAdapter() {
  return `${fileHeader("Chart.js Adapter").replace(/\/\*/g, "//").replace(/\*\//g, "//").replace(/ \* /g, "// ")}

/**
 * Integrates Chart.js with the Rapid Design System by:
 *
 *   1. Patching Chart.defaults with Rapid token values
 *   2. Providing a Chart.js plugin that re-reads tokens on theme change
 *   3. Exporting a palette helper for dataset colours
 *
 * Usage:
 *
 *   import Chart from "chart.js/auto";
 *   import { applyRapidDefaults, rapidThemePlugin } from "./chartjs";
 *
 *   applyRapidDefaults(Chart);
 *   Chart.register(rapidThemePlugin);
 *
 *   new Chart(ctx, { type: "bar", data: { ... } });
 */

import { token, tokenNumeric, palette, onThemeChange } from "./_css-vars-bridge";

/**
 * Patches Chart.defaults so every new chart inherits Rapid
 * typography, colours, and grid styling.
 */
export function applyRapidDefaults(Chart: any): void {
  const d = Chart.defaults;

  d.color = token("color-text-primary");
  d.borderColor = token("color-border-default");
  d.backgroundColor = token("color-surface-raised");

  d.font.family = token("font-family-base");
  d.font.size = tokenNumeric("font-size-md");

  d.plugins.title.color = token("color-text-primary");
  d.plugins.title.font = { ...d.plugins.title.font, weight: "600" };

  d.plugins.legend.labels.color = token("color-text-primary");
  d.plugins.tooltip.backgroundColor = token("color-surface-raised");
  d.plugins.tooltip.titleColor = token("color-text-primary");
  d.plugins.tooltip.bodyColor = token("color-text-secondary");
  d.plugins.tooltip.borderColor = token("color-border-default");
  d.plugins.tooltip.borderWidth = 1;
  d.plugins.tooltip.cornerRadius = tokenNumeric("radius-md");

  if (d.scales?.linear) {
    d.scales.linear.grid = { ...d.scales.linear.grid, color: token("color-border-default") };
  }
  if (d.scales?.category) {
    d.scales.category.grid = { ...d.scales.category.grid, color: token("color-border-default") };
  }
}

/**
 * Returns the Rapid colour palette for chart datasets.
 *
 *   const colors = getRapidChartPalette();
 *   datasets: [{ data, backgroundColor: colors }]
 */
export function getRapidChartPalette(): string[] {
  return palette();
}

/**
 * Chart.js plugin that listens for data-theme changes and
 * triggers a re-render so charts stay in sync with the active theme.
 *
 *   Chart.register(rapidThemePlugin);
 */
export const rapidThemePlugin = {
  id: "rapidTheme",

  beforeInit(chart: any): void {
    const cleanup = onThemeChange(() => {
      applyRapidDefaults(chart.constructor);
      chart.update("none");
    });

    (chart as any).__rapidCleanup = cleanup;
  },

  destroy(chart: any): void {
    (chart as any).__rapidCleanup?.();
  },
};
`;
}

// ---------------------------------------------------------------------------
// Highcharts JS Bridge (Non-Styled Mode)
// ---------------------------------------------------------------------------

function buildHighchartsJSAdapter() {
  return `${fileHeader("Highcharts JS Bridge (Non-Styled Mode)").replace(/\/\*/g, "//").replace(/\*\//g, "//").replace(/ \* /g, "// ")}

/**
 * For Highcharts in the default (non-styled / inline SVG) mode.
 * Reads Rapid CSS variables and pushes them into Highcharts'
 * global options via Highcharts.setOptions().
 *
 * If you use Highcharts Styled Mode instead, use the CSS adapter
 * (highcharts.css) — it's simpler and requires no JS bridge.
 *
 * Usage:
 *
 *   import Highcharts from "highcharts";
 *   import { applyRapidHighchartsTheme } from "./highcharts";
 *
 *   applyRapidHighchartsTheme(Highcharts);
 */

import { token, tokenNumeric, palette, onThemeChange } from "./_css-vars-bridge";

export function buildRapidHighchartsOptions(): Record<string, any> {
  const colors = palette();

  return {
    colors,
    chart: {
      backgroundColor: token("color-surface-base"),
      style: {
        fontFamily: token("font-family-base"),
        color: token("color-text-primary"),
      },
    },
    title: {
      style: {
        color: token("color-text-primary"),
        fontSize: token("font-size-xl"),
        fontWeight: token("font-weight-semibold"),
      },
    },
    subtitle: {
      style: {
        color: token("color-text-secondary"),
        fontSize: token("font-size-md"),
      },
    },
    xAxis: {
      labels: { style: { color: token("color-text-secondary"), fontSize: token("font-size-sm") } },
      title: { style: { color: token("color-text-secondary") } },
      lineColor: token("color-border-default"),
      gridLineColor: token("color-border-default"),
      tickColor: token("color-border-default"),
    },
    yAxis: {
      labels: { style: { color: token("color-text-secondary"), fontSize: token("font-size-sm") } },
      title: { style: { color: token("color-text-secondary") } },
      lineColor: token("color-border-default"),
      gridLineColor: token("color-border-default"),
      tickColor: token("color-border-default"),
    },
    legend: {
      itemStyle: {
        color: token("color-text-primary"),
        fontWeight: token("font-weight-regular"),
        fontSize: token("font-size-sm"),
      },
      itemHoverStyle: { color: token("color-brand-primary") },
    },
    tooltip: {
      backgroundColor: token("color-surface-raised"),
      borderColor: token("color-border-default"),
      style: {
        color: token("color-text-primary"),
        fontSize: token("font-size-sm"),
      },
    },
    plotOptions: {
      series: {
        borderColor: token("color-surface-base"),
      },
    },
    credits: {
      style: { color: token("color-text-secondary") },
    },
    navigation: {
      buttonOptions: {
        symbolStroke: token("color-text-primary"),
        theme: { fill: token("color-surface-base") },
      },
    },
  };
}

/**
 * Apply the Rapid theme to Highcharts globally.
 * Optionally returns a cleanup function for theme-change listening.
 */
export function applyRapidHighchartsTheme(
  Highcharts: any,
  options?: { watchThemeChanges?: boolean },
): (() => void) | void {
  Highcharts.setOptions(buildRapidHighchartsOptions());

  if (options?.watchThemeChanges) {
    return onThemeChange(() => {
      Highcharts.setOptions(buildRapidHighchartsOptions());
    });
  }
}
`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONFIG PRESETS
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Tailwind CSS Preset
// ---------------------------------------------------------------------------

function buildTailwindPreset(baseTokens) {
  const colorEntries = flatten(baseTokens.color || {});
  const spacingEntries = flatten(baseTokens.spacing || {});
  const radiusEntries = flatten(baseTokens.radius || {});
  const fontSizeEntries = flatten(baseTokens.font?.size || {});

  function buildNestedObject(entries, prefix) {
    const obj = {};
    for (const [key] of entries) {
      obj[key] = `var(--${PREFIX}-${prefix ? prefix + "-" : ""}${key})`;
    }
    return obj;
  }

  function colorTree(obj, path = "") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "object" && value !== null) {
        result[key] = colorTree(value, path ? `${path}-${key}` : key);
      } else {
        result[key] = `var(--${PREFIX}-color-${path ? path + "-" : ""}${key})`;
      }
    }
    return result;
  }

  const colors = colorTree(baseTokens.color || {});

  const spacing = {};
  for (const [key] of spacingEntries) {
    spacing[key] = `var(--${PREFIX}-spacing-${key})`;
  }

  const borderRadius = {};
  for (const [key] of radiusEntries) {
    borderRadius[key] = `var(--${PREFIX}-radius-${key})`;
  }

  const fontSize = {};
  for (const [key] of fontSizeEntries) {
    fontSize[key] = `var(--${PREFIX}-font-size-${key})`;
  }

  const fontWeight = {};
  for (const [key] of flatten(baseTokens.font?.weight || {})) {
    fontWeight[key] = `var(--${PREFIX}-font-weight-${key})`;
  }

  const lineHeight = {};
  for (const [key] of flatten(baseTokens.font?.["line-height"] || {})) {
    lineHeight[key] = `var(--${PREFIX}-font-line-height-${key})`;
  }

  const letterSpacing = {};
  for (const [key] of flatten(baseTokens.font?.["letter-spacing"] || {})) {
    letterSpacing[key] = `var(--${PREFIX}-font-letter-spacing-${key})`;
  }

  const opacity = {};
  for (const [key] of flatten(baseTokens.opacity || {})) {
    opacity[key] = `var(--${PREFIX}-opacity-${key})`;
  }

  const zIndex = {};
  for (const [key] of flatten(baseTokens.z || {})) {
    zIndex[key] = `var(--${PREFIX}-z-${key})`;
  }

  const transitionDuration = {};
  for (const [key] of flatten(baseTokens.duration || {})) {
    transitionDuration[key] = `var(--${PREFIX}-duration-${key})`;
  }

  const preset = {
    theme: {
      extend: {
        colors,
        spacing,
        borderRadius,
        fontSize,
        fontWeight,
        fontFamily: {
          sans: [`var(--${PREFIX}-font-family-base)`],
          mono: [`var(--${PREFIX}-font-family-mono)`],
        },
        lineHeight,
        letterSpacing,
        boxShadow: {
          sm: `var(--${PREFIX}-shadow-sm)`,
          DEFAULT: `var(--${PREFIX}-shadow-md)`,
          md: `var(--${PREFIX}-shadow-md)`,
          lg: `var(--${PREFIX}-shadow-lg)`,
        },
        opacity,
        zIndex,
        transitionDuration,
      },
    },
  };

  return `${fileHeader("Tailwind CSS Preset").replace(/\/\*/g, "//").replace(/\*\//g, "//").replace(/ \* /g, "// ")}

/**
 * Extends Tailwind's theme with Rapid CSS variable references.
 * All utilities (bg-brand-primary, text-surface-base, p-md, etc.)
 * resolve through Rapid's global custom properties, so theme
 * switching works automatically via data-theme.
 *
 * Usage in tailwind.config.js:
 *
 *   const rapidPreset = require("./packages/adapters/tailwind-preset");
 *
 *   module.exports = {
 *     presets: [rapidPreset],
 *     content: ["./src/**/*.{html,js,tsx}"],
 *   };
 */

/** @type {import('tailwindcss').Config} */
module.exports = ${JSON.stringify(preset, null, 2)};
`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONSOLE BRIDGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generates a plain JS file (no modules, no TS) that attaches window.rds
 * with a full API for inspecting and manipulating tokens from the browser
 * console. Include via <script> or paste into DevTools.
 */
function buildConsoleBridge(baseTokens, darkTokens) {
  const baseEntries = flatten(baseTokens);
  const darkEntries = flatten(darkTokens);
  const darkMap = Object.fromEntries(darkEntries);

  const tokenList = baseEntries.map(([key, value]) => {
    const dark = darkMap[key] || null;
    return `    "${key}": { light: "${sanitizeCSSValue(value)}", dark: ${dark ? `"${sanitizeCSSValue(dark)}"` : "null"} }`;
  });

  return `/**
 * Rapid Design System — Console Bridge
 * AUTO-GENERATED by scripts/build-tokens.js
 *
 * Drop this script on any page to get window.rds in the console:
 *
 *   rds.get("color-brand-primary")           // "#0f6cbd"
 *   rds.set("color-brand-primary", "#e74c3c")// instant update
 *   rds.dark()                                // switch to dark mode
 *   rds.light()                               // switch to light mode
 *   rds.list()                                // print all tokens
 *   rds.search("brand")                       // filter tokens
 *   rds.reset()                               // clear all overrides
 *   rds.export()                              // download JSON
 *   rds.diff()                                // show overrides only
 */
(function () {
  "use strict";

  var PREFIX = "--rapid-";
  var root = document.documentElement;

  var catalog = {
${tokenList.join(",\n")}
  };

  function getVal(name) {
    return getComputedStyle(root).getPropertyValue(PREFIX + name).trim();
  }

  var rds = {
    /** Read a token's current computed value. */
    get: function (name) {
      var v = getVal(name);
      if (!v) console.warn("[rds] Unknown token: " + name);
      return v;
    },

    /** Set a token value. Applies instantly to the page. */
    set: function (name, value) {
      root.style.setProperty(PREFIX + name, value);
      console.log("[rds] %c" + PREFIX + name + "%c = %c" + value,
        "color:#888", "color:inherit", "color:" + (value.startsWith("#") ? value : "inherit") + ";font-weight:bold");
      return value;
    },

    /** Remove an override, reverting to the stylesheet value. */
    unset: function (name) {
      root.style.removeProperty(PREFIX + name);
      console.log("[rds] " + PREFIX + name + " → default (" + getVal(name) + ")");
    },

    /** Switch to dark mode. */
    dark: function () {
      root.setAttribute("data-theme", "dark");
      console.log("[rds] Dark mode enabled");
    },

    /** Switch to light mode. */
    light: function () {
      root.removeAttribute("data-theme");
      console.log("[rds] Light mode enabled");
    },

    /** Toggle between light and dark. */
    toggle: function () {
      if (root.getAttribute("data-theme") === "dark") rds.light();
      else rds.dark();
    },

    /** List all tokens with current values. */
    list: function () {
      var entries = [];
      for (var name in catalog) {
        entries.push({ token: PREFIX + name, value: getVal(name) });
      }
      console.table(entries);
      return entries.length + " tokens";
    },

    /** Search tokens by keyword. */
    search: function (query) {
      var q = (query || "").toLowerCase();
      var entries = [];
      for (var name in catalog) {
        if (name.toLowerCase().includes(q)) {
          entries.push({ token: PREFIX + name, value: getVal(name), light: catalog[name].light, dark: catalog[name].dark });
        }
      }
      console.table(entries);
      return entries.length + " match(es)";
    },

    /** Show all active overrides (inline styles set on :root). */
    diff: function () {
      var overrides = [];
      var style = root.style;
      for (var i = 0; i < style.length; i++) {
        var prop = style[i];
        if (prop.startsWith(PREFIX)) {
          overrides.push({ token: prop, override: style.getPropertyValue(prop).trim() });
        }
      }
      if (overrides.length === 0) {
        console.log("[rds] No overrides active");
      } else {
        console.table(overrides);
      }
      return overrides.length + " override(s)";
    },

    /** Remove all inline overrides. */
    reset: function () {
      var removed = 0;
      var toRemove = [];
      var style = root.style;
      for (var i = 0; i < style.length; i++) {
        if (style[i].startsWith(PREFIX)) toRemove.push(style[i]);
      }
      for (var j = 0; j < toRemove.length; j++) {
        style.removeProperty(toRemove[j]);
        removed++;
      }
      console.log("[rds] Cleared " + removed + " override(s)");
    },

    /** Export current palette as nested JSON (tokens/local.json format). */
    export: function () {
      var nested = {};
      for (var name in catalog) {
        var val = getVal(name);
        var parts = name.split("-");
        var cursor = nested;
        for (var i = 0; i < parts.length - 1; i++) {
          if (!cursor[parts[i]]) cursor[parts[i]] = {};
          cursor = cursor[parts[i]];
        }
        cursor[parts[parts.length - 1]] = val;
      }
      var json = JSON.stringify(nested, null, 2);
      var blob = new Blob([json], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "local.json";
      a.click();
      URL.revokeObjectURL(url);
      console.log("[rds] Exported " + Object.keys(catalog).length + " tokens as local.json");
    },

    /** Import overrides from any format (nested JSON, flat CSS-var keys, or dot-path keys). */
    import: function (obj) {
      var count = 0;
      function walk(o, prefix) {
        for (var key in o) {
          if (key.startsWith("_")) continue;
          var val = o[key];
          if (typeof val === "object" && val !== null) {
            walk(val, prefix ? prefix + "-" + key : key);
          } else {
            var name;
            if (key.startsWith(PREFIX)) name = key;
            else if (prefix) name = PREFIX + prefix + "-" + key;
            else name = PREFIX + key.replace(/\\./g, "-");
            root.style.setProperty(name, val);
            count++;
          }
        }
      }
      var keys = Object.keys(obj);
      if (keys.length > 0 && typeof obj[keys[0]] === "object") {
        walk(obj, "");
      } else if (keys.length > 0 && keys[0].startsWith(PREFIX)) {
        for (var k in obj) { root.style.setProperty(k, obj[k]); count++; }
      } else {
        for (var k in obj) { root.style.setProperty(PREFIX + k.replace(/\\./g, "-"), obj[k]); count++; }
      }
      console.log("[rds] Imported " + count + " token(s)");
    },

    /** Print the token catalog with light/dark defaults. */
    catalog: catalog,

    /** Show help. */
    help: function () {
      console.log(
        "%cRapid Design System — Console API%c\\n\\n" +
        "  rds.get(name)          Read a token\\n" +
        "  rds.set(name, value)   Set a token (instant)\\n" +
        "  rds.unset(name)        Revert a single token\\n" +
        "  rds.dark()             Dark mode\\n" +
        "  rds.light()            Light mode\\n" +
        "  rds.toggle()           Toggle mode\\n" +
        "  rds.list()             Print all tokens\\n" +
        "  rds.search(query)      Filter tokens\\n" +
        "  rds.diff()             Show overrides\\n" +
        "  rds.reset()            Clear all overrides\\n" +
        "  rds.export()           Download JSON\\n" +
        "  rds.import({...})      Apply overrides from object\\n" +
        "  rds.catalog            Token defaults (light/dark)\\n\\n" +
        "  Token names omit the --rapid- prefix:\\n" +
        "  rds.set(\\"color-brand-primary\\", \\"#e74c3c\\")\\n",
        "font-weight:bold;font-size:13px;color:#0f6cbd",
        "font-weight:normal;font-size:12px;color:inherit"
      );
    }
  };

  window.rds = rds;

  if (typeof console !== "undefined" && console.log) {
    console.log(
      "%c[RDS]%c Console bridge loaded — type %crds.help()%c for commands",
      "background:#0f6cbd;color:#fff;padding:2px 6px;border-radius:3px;font-weight:600",
      "color:inherit",
      "color:#0f6cbd;font-weight:600",
      "color:inherit"
    );
  }
})();
`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  EDITOR SUPPORT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a VS Code CSS Custom Data file.
 * When referenced in .vscode/settings.json, this gives developers
 * autocomplete for all --rapid-* variables with descriptions
 * and light/dark values — zero extension install required.
 */
function buildCSSCustomData(baseTokens, darkTokens) {
  const baseDotEntries = flattenDotPath(baseTokens);
  const darkEntries = flatten(darkTokens);
  const darkMap = new Map(darkEntries); // keyed by hyphen-path

  const properties = [];

  for (const [dotPath, value] of baseDotEntries) {
    const cssKey = dotPath.replace(/\./g, "-");
    const cssVar = toCSSVar(cssKey);
    const darkValue = darkMap.get(cssKey);

    let desc = `Token: ${dotPath}`;
    desc += `\n\nLight: ${value}`;
    if (darkValue) desc += `\nDark: ${darkValue}`;

    const isColor = String(value).startsWith("#") || String(value).startsWith("rgba");
    const prop = {
      name: cssVar,
      description: desc,
    };

    if (isColor) prop.syntax = "<color>";

    properties.push(prop);
  }

  return JSON.stringify({ version: 1.1, properties }, null, 2) + "\n";
}

/**
 * Ensure .vscode/settings.json references the CSS custom data file.
 * Creates the file if missing; patches it if it exists but lacks the entry.
 */
function ensureSettingsJSON(vscodeDir) {
  const settingsPath = path.join(vscodeDir, "settings.json");
  const dataRef = ".vscode/rapid-tokens.css-data.json";
  let settings = {};

  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    } catch {
      settings = {};
    }
  }

  const key = "css.customData";
  if (!Array.isArray(settings[key])) {
    settings[key] = [];
  }

  if (!settings[key].includes(dataRef)) {
    settings[key].push(dataRef);
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    console.log("[RDS] ✓ .vscode/settings.json (css.customData registered)");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════

function main() {
  console.log("[RDS] Reading token sources…\n");

  const { tokens: baseTokens, dark: darkTokens, themes, stats } = loadAndMergeTokens();

  if (stats.localLoaded || stats.localDarkLoaded || stats.themes.length > 0) {
    console.log("  Extensions:");
    if (stats.localLoaded) {
      console.log(`  ✓ tokens/local.json loaded (${stats.overrides} override(s), ${stats.extensions} extension(s))`);
    }
    if (stats.localDarkLoaded) {
      console.log(`  ✓ tokens/local-dark.json loaded`);
    }
    if (stats.themes.length > 0) {
      console.log(`  ✓ ${stats.themes.length} named theme(s): ${stats.themes.join(", ")}`);
    }
    console.log("");
  }

  ensureDir(CSS_DIR);
  ensureDir(FLUENT_DIR);
  ensureDir(FLUENT_V8_DIR);
  ensureDir(ADAPTERS_DIR);

  // ── Core outputs ──────────────────────────────────────────────────────
  console.log("  Core outputs:");
  emit(path.join(CSS_DIR, "global.css"), buildGlobalCSS(baseTokens, darkTokens, themes));
  emit(path.join(CSS_DIR, "utilities.css"), buildUtilitiesCSS(baseTokens));
  emit(path.join(CSS_DIR, "scoped-overrides.css"), buildScopedOverridesCSS(baseTokens));

  // ── Fluent UI v9 ──────────────────────────────────────────────────────
  console.log("\n  Fluent UI v9 Adapter:");
  emit(path.join(FLUENT_DIR, "index.ts"), buildFluentAdapter());
  emit(path.join(FLUENT_DIR, "Provider.tsx"), buildProviderTSX());

  // ── Fluent UI v8 ──────────────────────────────────────────────────────
  console.log("\n  Fluent UI v8 Adapter:");
  emit(path.join(FLUENT_V8_DIR, "index.ts"), buildFluentV8Adapter());
  emit(path.join(FLUENT_V8_DIR, "Provider.tsx"), buildFluentV8ProviderTSX());

  // ── CSS Variable Override Adapters ────────────────────────────────────
  console.log("\n  CSS Variable Override Adapters:");
  emit(path.join(ADAPTERS_DIR, "bootstrap5.css"), buildBootstrap5Adapter());
  emit(path.join(ADAPTERS_DIR, "ag-grid.css"), buildAGGridAdapter());
  emit(path.join(ADAPTERS_DIR, "fullcalendar.css"), buildFullCalendarAdapter());
  emit(path.join(ADAPTERS_DIR, "telerik-kendo.css"), buildTelerikKendoAdapter());
  emit(path.join(ADAPTERS_DIR, "sweetalert2.css"), buildSweetAlert2Adapter());
  emit(path.join(ADAPTERS_DIR, "devextreme.css"), buildDevExtremeAdapter());
  emit(path.join(ADAPTERS_DIR, "primereact.css"), buildPrimeReactAdapter());
  emit(path.join(ADAPTERS_DIR, "bryntum.css"), buildBryntumAdapter());

  // ── CSS Class Override Adapters ───────────────────────────────────────
  console.log("\n  CSS Class Override Adapters:");
  emit(path.join(ADAPTERS_DIR, "highcharts.css"), buildHighchartsStyledAdapter());

  // ── Platform Bridge Adapters ──────────────────────────────────────────
  console.log("\n  Platform Bridge Adapters:");
  emit(path.join(ADAPTERS_DIR, "spfx.css"), buildSPFxAdapter());
  emit(path.join(ADAPTERS_DIR, "pcf-theme-bridge.ts"), buildPCFThemeBridge());

  // ── JavaScript Bridge Adapters ────────────────────────────────────────
  console.log("\n  JavaScript Bridge Adapters:");
  emit(path.join(ADAPTERS_DIR, "_css-vars-bridge.ts"), buildCSSVarsBridge());
  emit(path.join(ADAPTERS_DIR, "chartjs.ts"), buildChartJSAdapter());
  emit(path.join(ADAPTERS_DIR, "highcharts.ts"), buildHighchartsJSAdapter());

  // ── Config Presets ────────────────────────────────────────────────────
  console.log("\n  Config Presets:");
  emit(path.join(ADAPTERS_DIR, "tailwind-preset.js"), buildTailwindPreset(baseTokens));

  // ── Console Bridge ─────────────────────────────────────────────────
  console.log("\n  Console Bridge:");
  const runtimeDir = path.join(ROOT, "packages", "runtime");
  ensureDir(runtimeDir);
  emit(path.join(runtimeDir, "console.js"), buildConsoleBridge(baseTokens, darkTokens));

  // ── Editor Support ─────────────────────────────────────────────────
  console.log("\n  Editor Support:");
  const vscodeDir = path.join(ROOT, ".vscode");
  ensureDir(vscodeDir);
  emit(
    path.join(vscodeDir, "rapid-tokens.css-data.json"),
    buildCSSCustomData(baseTokens, darkTokens),
  );
  ensureSettingsJSON(vscodeDir);

  console.log("\n[RDS] Build complete.\n");
}

main();
