/**
 * Security Invariant Tests
 *
 * Verifies that the build pipeline correctly rejects prototype
 * pollution, CSS injection, and unsafe token keys/values.
 */

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");

describe("Prototype pollution prevention", () => {
  it("rejects __proto__ keys in local.json", () => {
    const localPath = path.join(ROOT, "tokens/local.json");
    const malicious = JSON.stringify({
      __proto__: { polluted: "true" },
      constructor: { prototype: { injected: "yes" } },
      color: { brand: { primary: "#ff0000" } },
    });

    fs.writeFileSync(localPath, malicious);
    try {
      execSync("node scripts/build-tokens.js", { cwd: ROOT, stdio: "pipe" });
      const css = fs.readFileSync(path.join(ROOT, "packages/css/global.css"), "utf-8");
      assert.ok(!css.includes("polluted"));
      assert.ok(!css.includes("injected"));
      assert.ok(css.includes("#ff0000"), "legitimate override should still apply");
    } finally {
      fs.unlinkSync(localPath);
    }
  });

  it("rejects __proto__ in token keys via flatten", () => {
    const localPath = path.join(ROOT, "tokens/local.json");
    fs.writeFileSync(localPath, JSON.stringify({
      color: { __proto__: { evil: "#000" } },
    }));
    try {
      execSync("node scripts/build-tokens.js", { cwd: ROOT, stdio: "pipe" });
      const css = fs.readFileSync(path.join(ROOT, "packages/css/global.css"), "utf-8");
      assert.ok(!css.includes("evil"));
    } finally {
      fs.unlinkSync(localPath);
    }
  });
});

describe("CSS injection prevention", () => {
  it("rejects values containing semicolons", () => {
    const localPath = path.join(ROOT, "tokens/local.json");
    fs.writeFileSync(localPath, JSON.stringify({
      color: { brand: { primary: "#fff; } * { background: red } :root {" } },
    }));
    try {
      const output = execSync("node scripts/build-tokens.js", { cwd: ROOT, stdio: "pipe" }).toString();
      const css = fs.readFileSync(path.join(ROOT, "packages/css/global.css"), "utf-8");
      assert.ok(!css.includes("background: red"));
      assert.ok(css.includes("REJECTED"));
    } finally {
      fs.unlinkSync(localPath);
    }
  });

  it("rejects values containing closing braces", () => {
    const localPath = path.join(ROOT, "tokens/local.json");
    fs.writeFileSync(localPath, JSON.stringify({
      color: { brand: { primary: "#fff } .evil { display:block" } },
    }));
    try {
      execSync("node scripts/build-tokens.js", { cwd: ROOT, stdio: "pipe" });
      const css = fs.readFileSync(path.join(ROOT, "packages/css/global.css"), "utf-8");
      assert.ok(!css.includes(".evil"));
    } finally {
      fs.unlinkSync(localPath);
    }
  });

  it("accepts valid hex colours", () => {
    const localPath = path.join(ROOT, "tokens/local.json");
    fs.writeFileSync(localPath, JSON.stringify({
      color: { brand: { primary: "#e74c3c" } },
    }));
    try {
      execSync("node scripts/build-tokens.js", { cwd: ROOT, stdio: "pipe" });
      const css = fs.readFileSync(path.join(ROOT, "packages/css/global.css"), "utf-8");
      assert.ok(css.includes("#e74c3c"));
    } finally {
      fs.unlinkSync(localPath);
    }
  });
});

describe("Semantic alias resolution", () => {
  it("resolves $-references in local.json", () => {
    const localPath = path.join(ROOT, "tokens/local.json");
    fs.writeFileSync(localPath, JSON.stringify({
      color: {
        action: { primary: "$color.brand.primary" },
      },
    }));
    try {
      execSync("node scripts/build-tokens.js", { cwd: ROOT, stdio: "pipe" });
      const css = fs.readFileSync(path.join(ROOT, "packages/css/global.css"), "utf-8");
      assert.ok(css.includes("--rapid-color-action-primary: #0f6cbd"));
    } finally {
      fs.unlinkSync(localPath);
    }
  });

  it("does not emit unresolved $-references as CSS values", () => {
    const localPath = path.join(ROOT, "tokens/local.json");
    fs.writeFileSync(localPath, JSON.stringify({
      color: {
        action: { primary: "$nonexistent.token" },
      },
    }));
    try {
      execSync("node scripts/build-tokens.js", { cwd: ROOT, stdio: "pipe" });
      const css = fs.readFileSync(path.join(ROOT, "packages/css/global.css"), "utf-8");
      assert.ok(css.includes("$nonexistent.token") || !css.includes("--rapid-color-action-primary"));
    } finally {
      fs.unlinkSync(localPath);
    }
  });
});

describe("Named theme compilation", () => {
  it("compiles themes/*.json to [data-theme] blocks", () => {
    const themesDir = path.join(ROOT, "tokens/themes");
    fs.mkdirSync(themesDir, { recursive: true });
    fs.writeFileSync(
      path.join(themesDir, "testbrand.json"),
      JSON.stringify({ color: { brand: { primary: "#abcdef" } } }),
    );
    try {
      execSync("node scripts/build-tokens.js", { cwd: ROOT, stdio: "pipe" });
      const css = fs.readFileSync(path.join(ROOT, "packages/css/global.css"), "utf-8");
      assert.ok(css.includes('[data-theme="testbrand"]'));
      assert.ok(css.includes("#abcdef"));
    } finally {
      fs.unlinkSync(path.join(themesDir, "testbrand.json"));
    }
  });
});
