#!/usr/bin/env node

/**
 * Rapid Design System — Cross-Platform Token Export
 *
 * Generates platform-native token files from the canonical JSON source:
 *   - React Native (TypeScript)
 *   - iOS (Swift UIColor/CGFloat extensions)
 *   - Android (Kotlin color/dimen resources)
 *
 * Usage:
 *   node scripts/export-native.js                  — generates all platforms
 *   node scripts/export-native.js --platform rn    — React Native only
 *   node scripts/export-native.js --platform ios   — iOS only
 *   node scripts/export-native.js --platform android — Android only
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TOKENS_DIR = path.join(ROOT, "tokens");
const NATIVE_DIR = path.join(ROOT, "packages", "native");

const args = process.argv.slice(2);
const platformArg = args.find((_, i, a) => a[i - 1] === "--platform") || "all";

function readJSON(p) { return JSON.parse(fs.readFileSync(p, "utf-8")); }
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

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

function toCamelCase(str) {
  return str.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function toPascalCase(str) {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function toSnakeCase(str) {
  return str.replace(/-/g, "_");
}

// ---------------------------------------------------------------------------
// React Native
// ---------------------------------------------------------------------------

function generateReactNative(light, dark) {
  const lightEntries = flatten(light);
  const darkEntries = flatten(dark);
  const darkMap = new Map(darkEntries);

  const lines = [
    `// Rapid Design System — React Native Tokens`,
    `// AUTO-GENERATED — DO NOT EDIT`,
    ``,
    `export const rapidTokens = {`,
  ];

  for (const [key, value] of lightEntries) {
    lines.push(`  ${toCamelCase(key)}: "${value}",`);
  }
  lines.push(`} as const;`, ``);

  lines.push(`export const rapidDarkTokens: Partial<typeof rapidTokens> = {`);
  for (const [key, value] of darkEntries) {
    lines.push(`  ${toCamelCase(key)}: "${value}",`);
  }
  lines.push(`} as const;`, ``);

  lines.push(`export type RapidTokenKey = keyof typeof rapidTokens;`, ``);

  lines.push(`/**`);
  lines.push(` * Returns the active token set based on the colour scheme.`);
  lines.push(` * Usage with React Native:`);
  lines.push(` *   import { useColorScheme } from "react-native";`);
  lines.push(` *   const tokens = useRapidTokens(useColorScheme() ?? "light");`);
  lines.push(` */`);
  lines.push(`export function useRapidTokens(scheme: "light" | "dark"): typeof rapidTokens {`);
  lines.push(`  if (scheme === "dark") {`);
  lines.push(`    return { ...rapidTokens, ...rapidDarkTokens };`);
  lines.push(`  }`);
  lines.push(`  return rapidTokens;`);
  lines.push(`}`, ``);

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// iOS / Swift
// ---------------------------------------------------------------------------

function hexToSwiftRGBA(hex) {
  if (!hex.startsWith("#") || hex.length !== 7) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r: r.toFixed(3), g: g.toFixed(3), b: b.toFixed(3) };
}

function generateSwift(light, dark) {
  const lightEntries = flatten(light);
  const darkMap = new Map(flatten(dark));

  const lines = [
    `// Rapid Design System — iOS Tokens`,
    `// AUTO-GENERATED — DO NOT EDIT`,
    ``,
    `import UIKit`,
    ``,
    `public enum RapidTokens {`,
    ``,
    `    // MARK: - Colors`,
    ``,
  ];

  const colorEntries = lightEntries.filter(([k]) => k.startsWith("color-"));
  for (const [key, value] of colorEntries) {
    const name = toCamelCase(key.replace(/^color-/, ""));
    const lightRGB = hexToSwiftRGBA(value);
    const darkValue = darkMap.get(key);
    const darkRGB = darkValue ? hexToSwiftRGBA(darkValue) : null;

    if (!lightRGB) continue;

    if (darkRGB) {
      lines.push(`    public static let ${name} = UIColor { traits in`);
      lines.push(`        traits.userInterfaceStyle == .dark`);
      lines.push(`            ? UIColor(red: ${darkRGB.r}, green: ${darkRGB.g}, blue: ${darkRGB.b}, alpha: 1)`);
      lines.push(`            : UIColor(red: ${lightRGB.r}, green: ${lightRGB.g}, blue: ${lightRGB.b}, alpha: 1)`);
      lines.push(`    }`);
    } else {
      lines.push(`    public static let ${name} = UIColor(red: ${lightRGB.r}, green: ${lightRGB.g}, blue: ${lightRGB.b}, alpha: 1)`);
    }
    lines.push(``);
  }

  // Spacing, radius, font sizes as CGFloat
  const numericEntries = lightEntries.filter(([k, v]) =>
    !k.startsWith("color-") && !k.startsWith("shadow-") && !k.startsWith("font-family") &&
    typeof v === "string" && /^\d/.test(v)
  );

  if (numericEntries.length > 0) {
    lines.push(`    // MARK: - Dimensions`, ``);
    for (const [key, value] of numericEntries) {
      const name = toCamelCase(key);
      const num = parseFloat(value);
      if (!isNaN(num)) {
        lines.push(`    public static let ${name}: CGFloat = ${num}`);
      }
    }
    lines.push(``);
  }

  lines.push(`}`);
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Android / Kotlin
// ---------------------------------------------------------------------------

function hexToAndroidColor(hex) {
  if (!hex.startsWith("#") || hex.length !== 7) return null;
  return `0xFF${hex.slice(1).toUpperCase()}`;
}

function generateKotlin(light, dark) {
  const lightEntries = flatten(light);
  const darkMap = new Map(flatten(dark));

  const lines = [
    `// Rapid Design System — Android Tokens`,
    `// AUTO-GENERATED — DO NOT EDIT`,
    ``,
    `package com.rapid.designsystem`,
    ``,
    `import androidx.compose.ui.graphics.Color`,
    `import androidx.compose.ui.unit.dp`,
    `import androidx.compose.ui.unit.sp`,
    ``,
    `object RapidTokens {`,
    ``,
    `    // region Colors`,
    ``,
  ];

  const colorEntries = lightEntries.filter(([k]) => k.startsWith("color-"));
  for (const [key, value] of colorEntries) {
    const name = toCamelCase(key.replace(/^color-/, ""));
    const android = hexToAndroidColor(value);
    if (!android) continue;
    lines.push(`    val ${name} = Color(${android})`);
  }

  lines.push(``, `    // endregion`, ``);

  // Dark overrides
  const darkColorEntries = flatten(dark).filter(([k]) => k.startsWith("color-"));
  if (darkColorEntries.length > 0) {
    lines.push(`    // region Dark Colors`, ``);
    for (const [key, value] of darkColorEntries) {
      const name = toCamelCase(key.replace(/^color-/, "")) + "Dark";
      const android = hexToAndroidColor(value);
      if (!android) continue;
      lines.push(`    val ${name} = Color(${android})`);
    }
    lines.push(``, `    // endregion`, ``);
  }

  // Dimensions
  const spacingEntries = lightEntries.filter(([k, v]) =>
    (k.startsWith("spacing-") || k.startsWith("radius-")) && typeof v === "string" && /^\d/.test(v)
  );

  if (spacingEntries.length > 0) {
    lines.push(`    // region Dimensions`, ``);
    for (const [key, value] of spacingEntries) {
      const name = toCamelCase(key);
      const num = parseFloat(value);
      if (!isNaN(num)) {
        lines.push(`    val ${name} = ${num}.dp`);
      }
    }
    lines.push(``, `    // endregion`, ``);
  }

  // Font sizes
  const fontSizeEntries = lightEntries.filter(([k, v]) =>
    k.startsWith("font-size-") && typeof v === "string" && /^\d/.test(v)
  );

  if (fontSizeEntries.length > 0) {
    lines.push(`    // region Font Sizes`, ``);
    for (const [key, value] of fontSizeEntries) {
      const name = toCamelCase(key);
      const num = parseFloat(value);
      if (!isNaN(num)) {
        lines.push(`    val ${name} = ${num}.sp`);
      }
    }
    lines.push(``, `    // endregion`, ``);
  }

  lines.push(`}`);
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log("[export-native] Rapid Design System — Cross-Platform Export\n");

  const light = readJSON(path.join(TOKENS_DIR, "base.json"));
  const dark = readJSON(path.join(TOKENS_DIR, "dark.json"));

  ensureDir(NATIVE_DIR);

  const platforms = platformArg === "all" ? ["rn", "ios", "android"] : [platformArg];

  for (const platform of platforms) {
    switch (platform) {
      case "rn": {
        const content = generateReactNative(light, dark);
        fs.writeFileSync(path.join(NATIVE_DIR, "tokens.ts"), content);
        console.log("  ✓ packages/native/tokens.ts (React Native)");
        break;
      }
      case "ios": {
        const content = generateSwift(light, dark);
        fs.writeFileSync(path.join(NATIVE_DIR, "RapidTokens.swift"), content);
        console.log("  ✓ packages/native/RapidTokens.swift (iOS)");
        break;
      }
      case "android": {
        const content = generateKotlin(light, dark);
        fs.writeFileSync(path.join(NATIVE_DIR, "RapidTokens.kt"), content);
        console.log("  ✓ packages/native/RapidTokens.kt (Android)");
        break;
      }
      default:
        console.error(`  Unknown platform: ${platform}. Use: rn, ios, android`);
    }
  }

  console.log("\nDone.");
}

main();
