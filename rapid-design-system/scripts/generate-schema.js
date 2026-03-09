#!/usr/bin/env node

/**
 * Rapid Design System — JSON Schema Generator
 *
 * Reads base.json and generates a JSON Schema that validates
 * the token file structure.  Drop the schema into your editor
 * for instant validation of base.json, dark.json, and local.json.
 *
 * Usage:
 *   node scripts/generate-schema.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BASE_PATH = path.join(ROOT, "tokens", "base.json");
const SCHEMA_PATH = path.join(ROOT, "tokens", "token-schema.json");

function inferType(value) {
  if (typeof value !== "string") return { type: "string" };
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return { type: "string", pattern: "^#[0-9a-fA-F]{6}$", description: "Hex colour" };
  if (/^\d+px$/.test(value)) return { type: "string", pattern: "^\\d+(\\.\\d+)?px$", description: "Pixel value" };
  if (/^\d+(\.\d+)?$/.test(value)) return { type: "string", pattern: "^\\d+(\\.\\d+)?$", description: "Numeric value" };
  if (/^-?\d+(\.\d+)?em$/.test(value)) return { type: "string", description: "Em value" };
  if (/^\d+ms$/.test(value)) return { type: "string", pattern: "^\\d+ms$", description: "Duration in ms" };
  if (/^cubic-bezier/.test(value)) return { type: "string", description: "CSS easing function" };
  if (/^rgba?\(/.test(value)) return { type: "string", description: "Shadow or rgba value" };
  return { type: "string" };
}

function buildSchema(obj, title) {
  const properties = {};
  const desc = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key === "_comment") continue;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      properties[key] = buildSchema(value, key);
    } else {
      properties[key] = inferType(value);
    }
  }

  return {
    type: "object",
    properties,
    additionalProperties: true,
  };
}

function main() {
  const base = JSON.parse(fs.readFileSync(BASE_PATH, "utf-8"));

  const schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "Rapid Design System Token File",
    description: "Schema for tokens/base.json, tokens/dark.json, and tokens/local.json. Additional properties are allowed for extensibility.",
    ...buildSchema(base, "root"),
  };

  fs.writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 2) + "\n");
  console.log("[RDS] ✓ tokens/token-schema.json generated");
  console.log(`      ${Object.keys(schema.properties).length} top-level categories\n`);
  console.log('  Add to your token files for IDE validation:');
  console.log('    { "$schema": "./token-schema.json", ... }\n');
}

main();
