#!/usr/bin/env node

/**
 * Rapid Design System — Auto Dark Mode Derivation
 *
 * Reads tokens/base.json and algorithmically generates dark mode
 * values using colour science (lightness inversion, saturation
 * preservation, shadow density adjustment).
 *
 * Usage:
 *   node scripts/generate-dark.js              — writes tokens/dark.json
 *   node scripts/generate-dark.js --dry-run    — preview only
 *   node scripts/generate-dark.js --stdout     — print to stdout
 *
 * The output is a starting point.  Review and tweak specific values
 * as needed — the algorithm handles ~90% of cases correctly.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BASE_PATH = path.join(ROOT, "tokens", "base.json");
const DARK_PATH = path.join(ROOT, "tokens", "dark.json");

const DRY_RUN = process.argv.includes("--dry-run");
const STDOUT = process.argv.includes("--stdout");

// ---------------------------------------------------------------------------
// Colour Science
// ---------------------------------------------------------------------------

function hexToRGB(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHSL({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
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
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: hue2rgb(p, q, h + 1 / 3),
    g: hue2rgb(p, q, h),
    b: hue2rgb(p, q, h - 1 / 3),
  };
}

/**
 * Derive a dark-mode colour from a light-mode hex value.
 *
 * Strategy:
 *   - Very light colours (L > 0.85): surfaces → invert to dark (L → 0.10–0.22)
 *   - Very dark colours (L < 0.15): text → invert to light (L → 0.85–0.92)
 *   - Mid-range colours (brand, status): lighten slightly, boost saturation
 *   - Pure white → near-black surface; pure black → near-white text
 */
function deriveDarkColor(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;

  const rgb = hexToRGB(hex);
  const hsl = rgbToHSL(rgb);

  // Pure white or very light → dark surface
  if (hsl.l > 0.92) {
    hsl.l = 0.11;
    hsl.s = Math.min(hsl.s, 0.05);
    return rgbToHex(hslToRGB(hsl));
  }

  // Light surfaces (greys, near-whites)
  if (hsl.l > 0.85 && hsl.s < 0.15) {
    hsl.l = 0.12 + (hsl.l - 0.85) * 1.5;
    hsl.s = Math.min(hsl.s, 0.05);
    return rgbToHex(hslToRGB(hsl));
  }

  // Light greys (borders, muted)
  if (hsl.l > 0.6 && hsl.s < 0.1) {
    hsl.l = 0.28 + (hsl.l - 0.6) * 0.3;
    return rgbToHex(hslToRGB(hsl));
  }

  // Very dark text → light text
  if (hsl.l < 0.2) {
    hsl.l = 0.88;
    hsl.s = Math.min(hsl.s, 0.05);
    return rgbToHex(hslToRGB(hsl));
  }

  // Mid-dark text (secondary)
  if (hsl.l < 0.45 && hsl.s < 0.1) {
    hsl.l = 0.68;
    return rgbToHex(hslToRGB(hsl));
  }

  // Saturated mid-range colours (brand, status)
  if (hsl.s > 0.3) {
    hsl.l = Math.min(0.65, hsl.l + 0.2);
    hsl.s = Math.min(1, hsl.s * 1.1);
    return rgbToHex(hslToRGB(hsl));
  }

  // Fallback: gentle lightness shift
  hsl.l = Math.min(0.75, hsl.l + 0.15);
  return rgbToHex(hslToRGB(hsl));
}

// ---------------------------------------------------------------------------
// Shadow adjustment
// ---------------------------------------------------------------------------

function deriveDarkShadow(value) {
  return value.replace(
    /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g,
    (_, r, g, b, a) => {
      const darkAlpha = Math.min(1, parseFloat(a) * 2.5);
      return `rgba(0, 0, 0, ${darkAlpha.toFixed(2)})`;
    },
  );
}

// ---------------------------------------------------------------------------
// Walk token tree
// ---------------------------------------------------------------------------

function deriveObject(obj, lightObj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "_comment") continue;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const nested = deriveObject(value, lightObj?.[key]);
      if (Object.keys(nested).length > 0) result[key] = nested;
    } else if (typeof value === "string") {
      let derived = null;

      if (value.startsWith("#") && value.length === 7) {
        derived = deriveDarkColor(value);
      } else if (value.includes("rgba(")) {
        derived = deriveDarkShadow(value);
      }

      if (derived && derived !== value) {
        result[key] = derived;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log("[generate-dark] Rapid Design System — Auto Dark Mode Derivation\n");

  const base = JSON.parse(fs.readFileSync(BASE_PATH, "utf-8"));
  const dark = deriveObject(base, base);

  const flatCount = (obj) => {
    let n = 0;
    for (const v of Object.values(obj)) {
      if (typeof v === "object" && v !== null) n += flatCount(v);
      else n++;
    }
    return n;
  };

  console.log(`  Derived ${flatCount(dark)} dark overrides from ${flatCount(base)} light tokens.\n`);

  const json = JSON.stringify(dark, null, 2) + "\n";

  if (STDOUT) {
    process.stdout.write(json);
    return;
  }

  if (DRY_RUN) {
    console.log("  [dry-run] Would write tokens/dark.json:\n");
    console.log(json.split("\n").slice(0, 40).join("\n"));
    return;
  }

  fs.writeFileSync(DARK_PATH, json);
  console.log("  ✓ tokens/dark.json written\n");
  console.log("  Review the output and adjust specific values as needed.");
  console.log("  Then run: npm run build\n");
}

main();
