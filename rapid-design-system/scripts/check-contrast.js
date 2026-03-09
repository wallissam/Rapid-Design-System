#!/usr/bin/env node

/**
 * Rapid Design System — WCAG Contrast Checker
 *
 * Reads the compiled tokens and validates that all text/background
 * colour pairs meet WCAG 2.1 contrast ratio requirements.
 *
 * Checked pairs:
 *   text.primary     on  surface.base, surface.raised, surface.overlay
 *   text.secondary   on  surface.base, surface.raised, surface.overlay
 *   text.disabled    on  surface.base, surface.disabled
 *   text.on-brand    on  brand.primary, brand.secondary, brand.tertiary
 *   text.on-brand    on  status.info, status.success, status.warning, status.danger
 *   text.link        on  surface.base, surface.raised
 *
 * Requirements:
 *   AA Normal text:  ratio >= 4.5
 *   AA Large text:   ratio >= 3.0
 *   AAA Normal text: ratio >= 7.0
 *
 * Usage:
 *   node scripts/check-contrast.js            — check light + dark
 *   node scripts/check-contrast.js --strict   — exit 1 on any AA failure
 *   node scripts/check-contrast.js --aaa      — check AAA level
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BASE_PATH = path.join(ROOT, "tokens", "base.json");
const DARK_PATH = path.join(ROOT, "tokens", "dark.json");

const STRICT = process.argv.includes("--strict");
const CHECK_AAA = process.argv.includes("--aaa");

// ---------------------------------------------------------------------------
// Colour math (relative luminance + contrast ratio per WCAG 2.1)
// ---------------------------------------------------------------------------

function hexToRGB(hex) {
  if (!hex || !hex.startsWith("#") || hex.length !== 7) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

function linearize(c) {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(hex1, hex2) {
  const rgb1 = hexToRGB(hex1);
  const rgb2 = hexToRGB(hex2);
  if (!rgb1 || !rgb2) return null;

  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHex({ r, g, b }) {
  const h = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbToHSL({ r, g, b }) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h, s, l };
}

function hslToRGB({ h, s, l }) {
  if (s === 0) return { r: l, g: l, b: l };
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: hue2rgb(p, q, h + 1/3), g: hue2rgb(p, q, h), b: hue2rgb(p, q, h - 1/3) };
}

/**
 * Find the nearest colour to `fgHex` that achieves the target
 * contrast ratio against `bgHex`.  Adjusts lightness in HSL space
 * using binary search.
 */
function suggestCompliantColor(fgHex, bgHex, targetRatio) {
  const fgRGB = hexToRGB(fgHex);
  const bgRGB = hexToRGB(bgHex);
  if (!fgRGB || !bgRGB) return null;

  const bgLum = relativeLuminance(bgRGB);
  const fgHSL = rgbToHSL(fgRGB);

  // Try darkening and lightening; pick the one closer to original
  const candidates = [];

  for (const direction of ["darken", "lighten"]) {
    let lo = direction === "darken" ? 0 : fgHSL.l;
    let hi = direction === "darken" ? fgHSL.l : 1;

    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const testRGB = hslToRGB({ h: fgHSL.h, s: fgHSL.s, l: mid });
      const testLum = relativeLuminance(testRGB);
      const lighter = Math.max(testLum, bgLum);
      const darker = Math.min(testLum, bgLum);
      const ratio = (lighter + 0.05) / (darker + 0.05);

      if (direction === "darken") {
        if (ratio >= targetRatio) lo = mid; else hi = mid;
      } else {
        if (ratio >= targetRatio) hi = mid; else lo = mid;
      }
    }

    const finalL = direction === "darken" ? lo : hi;
    const finalRGB = hslToRGB({ h: fgHSL.h, s: fgHSL.s, l: finalL });
    const finalHex = rgbToHex(finalRGB);
    const finalRatio = contrastRatio(finalHex, bgHex);

    if (finalRatio && finalRatio >= targetRatio) {
      const distance = Math.abs(finalL - fgHSL.l);
      candidates.push({ hex: finalHex, ratio: finalRatio, distance });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Token resolution (deep nested path → value)
// ---------------------------------------------------------------------------

function resolve(obj, dotPath) {
  const parts = dotPath.split(".");
  let cursor = obj;
  for (const p of parts) {
    if (cursor === undefined || cursor === null) return undefined;
    cursor = cursor[p];
  }
  return cursor;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const [key, val] of Object.entries(source)) {
    if (typeof val === "object" && val !== null && !Array.isArray(val) &&
        typeof result[key] === "object" && result[key] !== null) {
      result[key] = deepMerge(result[key], val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pair definitions
// ---------------------------------------------------------------------------

const PAIRS = [
  // Standard text on surfaces
  { fg: "color.text.primary", bg: "color.surface.base", context: "Body text on base" },
  { fg: "color.text.primary", bg: "color.surface.raised", context: "Body text on card" },
  { fg: "color.text.primary", bg: "color.surface.overlay", context: "Body text on overlay" },
  { fg: "color.text.secondary", bg: "color.surface.base", context: "Secondary text on base" },
  { fg: "color.text.secondary", bg: "color.surface.raised", context: "Secondary text on card" },
  { fg: "color.text.secondary", bg: "color.surface.overlay", context: "Secondary text on overlay" },
  { fg: "color.text.disabled", bg: "color.surface.base", context: "Disabled text on base" },
  { fg: "color.text.disabled", bg: "color.surface.disabled", context: "Disabled text on disabled bg" },
  { fg: "color.text.link", bg: "color.surface.base", context: "Link on base" },
  { fg: "color.text.link", bg: "color.surface.raised", context: "Link on card" },

  // Text on brand / status
  { fg: "color.text.on-brand", bg: "color.brand.primary", context: "On-brand text on primary" },
  { fg: "color.text.on-brand", bg: "color.brand.secondary", context: "On-brand text on secondary" },
  { fg: "color.text.on-brand", bg: "color.brand.tertiary", context: "On-brand text on tertiary" },
  { fg: "color.text.on-brand", bg: "color.status.info", context: "On-brand text on info" },
  { fg: "color.text.on-brand", bg: "color.status.success", context: "On-brand text on success" },
  { fg: "color.text.on-brand", bg: "color.status.warning", context: "On-brand text on warning" },
  { fg: "color.text.on-brand", bg: "color.status.danger", context: "On-brand text on danger" },

  // Status text on base
  { fg: "color.status.success", bg: "color.surface.base", context: "Success text on base" },
  { fg: "color.status.warning", bg: "color.surface.base", context: "Warning text on base" },
  { fg: "color.status.danger", bg: "color.surface.base", context: "Danger text on base" },
  { fg: "color.status.info", bg: "color.surface.base", context: "Info text on base" },

  // Brand on surface
  { fg: "color.brand.primary", bg: "color.surface.base", context: "Brand primary on base" },

  // Border visibility
  { fg: "color.border.default", bg: "color.surface.base", context: "Border on base (visibility)" },
];

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function checkMode(label, tokens) {
  const results = [];
  let pass = 0;
  let fail = 0;
  let warn = 0;

  for (const pair of PAIRS) {
    const fgVal = resolve(tokens, pair.fg);
    const bgVal = resolve(tokens, pair.bg);
    if (!fgVal || !bgVal) continue;

    const ratio = contrastRatio(fgVal, bgVal);
    if (ratio === null) continue;

    const aaPass = ratio >= 4.5;
    const aaLarge = ratio >= 3.0;
    const aaaPass = ratio >= 7.0;

    const threshold = CHECK_AAA ? 7.0 : 4.5;
    const status = ratio >= threshold ? "PASS" : ratio >= 3.0 ? "WARN" : "FAIL";

    if (status === "PASS") pass++;
    else if (status === "WARN") warn++;
    else fail++;

    let suggestion = null;
    if (status !== "PASS") {
      suggestion = suggestCompliantColor(fgVal, bgVal, threshold);
    }

    results.push({ ...pair, fgVal, bgVal, ratio, status, suggestion });
  }

  return { label, results, pass, fail, warn };
}

function printResults(modeResult) {
  const { label, results, pass, fail, warn } = modeResult;

  console.log(`\n  ── ${label} ──\n`);

  const icon = { PASS: "✓", WARN: "△", FAIL: "✗" };
  const colour = { PASS: "\x1b[32m", WARN: "\x1b[33m", FAIL: "\x1b[31m" };
  const reset = "\x1b[0m";

  for (const r of results) {
    const i = icon[r.status];
    const c = colour[r.status];
    const ratio = r.ratio.toFixed(2).padStart(5);
    let line = `  ${c}${i}${reset} ${ratio}:1  ${r.context.padEnd(35)} ${r.fgVal} on ${r.bgVal}`;
    if (r.suggestion) {
      line += `  → try ${r.suggestion.hex} (${r.suggestion.ratio.toFixed(1)}:1)`;
    }
    console.log(line);
  }

  console.log(`\n  ${pass} pass, ${warn} warning, ${fail} fail`);

  return fail;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log("\n  ┌──────────────────────────────────────────────────────┐");
  console.log("  │  Rapid Design System — WCAG 2.1 Contrast Checker    │");
  console.log(`  │  Level: ${CHECK_AAA ? "AAA (7.0:1)" : "AA  (4.5:1)"}                                  │`);
  console.log("  └──────────────────────────────────────────────────────┘");

  const base = JSON.parse(fs.readFileSync(BASE_PATH, "utf-8"));
  const dark = JSON.parse(fs.readFileSync(DARK_PATH, "utf-8"));
  const darkMerged = deepMerge(base, dark);

  const lightResult = checkMode("Light Mode", base);
  const darkResult = checkMode("Dark Mode", darkMerged);

  const lightFails = printResults(lightResult);
  const darkFails = printResults(darkResult);

  const totalFails = lightFails + darkFails;

  if (totalFails > 0) {
    console.log(`\n  ⚠ ${totalFails} contrast failure(s) detected.`);
    if (STRICT) {
      console.log("  Exiting with code 1 (--strict mode).\n");
      process.exit(1);
    }
  } else {
    console.log(`\n  ✓ All ${lightResult.results.length + darkResult.results.length} pairs pass ${CHECK_AAA ? "AAA" : "AA"} contrast requirements.\n`);
  }
}

main();
