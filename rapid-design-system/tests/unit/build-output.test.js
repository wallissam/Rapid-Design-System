/**
 * Build Output Validation Tests
 *
 * Verifies that `npm run build` produces the correct files
 * with expected content structure. Run after every build.
 */

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");

before(() => {
  execSync("node scripts/build-tokens.js", { cwd: ROOT, stdio: "pipe" });
});

describe("Build output files", () => {
  const expectedFiles = [
    "packages/css/global.css",
    "packages/css/utilities.css",
    "packages/css/scoped-overrides.css",
    "packages/fluent-adapter/index.ts",
    "packages/fluent-adapter/Provider.tsx",
    "packages/fluent-v8-adapter/index.ts",
    "packages/fluent-v8-adapter/Provider.tsx",
    "packages/adapters/bootstrap5.css",
    "packages/adapters/ag-grid.css",
    "packages/adapters/fullcalendar.css",
    "packages/adapters/telerik-kendo.css",
    "packages/adapters/sweetalert2.css",
    "packages/adapters/devextreme.css",
    "packages/adapters/primereact.css",
    "packages/adapters/bryntum.css",
    "packages/adapters/highcharts.css",
    "packages/adapters/spfx.css",
    "packages/adapters/pcf-theme-bridge.ts",
    "packages/adapters/_css-vars-bridge.ts",
    "packages/adapters/chartjs.ts",
    "packages/adapters/highcharts.ts",
    "packages/adapters/tailwind-preset.js",
    ".vscode/rapid-tokens.css-data.json",
  ];

  for (const file of expectedFiles) {
    it(`generates ${file}`, () => {
      const filePath = path.join(ROOT, file);
      assert.ok(fs.existsSync(filePath), `Missing: ${file}`);
      const stat = fs.statSync(filePath);
      assert.ok(stat.size > 0, `Empty: ${file}`);
    });
  }

  it("all generated files have AUTO-GENERATED header", () => {
    for (const file of expectedFiles) {
      const content = fs.readFileSync(path.join(ROOT, file), "utf-8");
      assert.ok(
        content.includes("AUTO-GENERATED") || content.includes("auto-generated") || file.endsWith(".json"),
        `Missing AUTO-GENERATED header: ${file}`,
      );
    }
  });
});

describe("global.css content", () => {
  let css;
  before(() => {
    css = fs.readFileSync(path.join(ROOT, "packages/css/global.css"), "utf-8");
  });

  it("has :root block", () => {
    assert.ok(css.includes(":root {"));
  });

  it("has dark mode block", () => {
    assert.ok(css.includes('[data-theme="dark"]'));
  });

  it("contains all expected color tokens", () => {
    const expected = [
      "--rapid-color-brand-primary",
      "--rapid-color-surface-base",
      "--rapid-color-text-primary",
      "--rapid-color-text-disabled",
      "--rapid-color-text-link",
      "--rapid-color-border-default",
      "--rapid-color-focus-ring",
      "--rapid-color-status-info",
      "--rapid-color-status-success",
      "--rapid-color-status-warning",
      "--rapid-color-status-danger",
    ];
    for (const token of expected) {
      assert.ok(css.includes(token), `Missing token: ${token}`);
    }
  });

  it("contains spacing tokens", () => {
    for (const size of ["xs", "sm", "md", "lg", "xl", "2xl"]) {
      assert.ok(css.includes(`--rapid-spacing-${size}`));
    }
  });

  it("contains easing tokens", () => {
    assert.ok(css.includes("--rapid-easing-default"));
    assert.ok(css.includes("cubic-bezier"));
  });

  it("contains opacity tokens", () => {
    assert.ok(css.includes("--rapid-opacity-disabled"));
  });

  it("contains z-index tokens", () => {
    assert.ok(css.includes("--rapid-z-modal"));
  });

  it("contains named theme blocks when themes exist", () => {
    if (fs.existsSync(path.join(ROOT, "tokens/themes/contoso.json"))) {
      assert.ok(css.includes('[data-theme="contoso"]'));
    }
  });
});

describe("utilities.css content", () => {
  let css;
  before(() => {
    css = fs.readFileSync(path.join(ROOT, "packages/css/utilities.css"), "utf-8");
  });

  it("generates color utility classes without double-text", () => {
    assert.ok(css.includes(".rapid-text-primary {"));
    assert.ok(!css.includes(".rapid-text-text-primary"));
  });

  it("generates border-color utilities", () => {
    assert.ok(css.includes(".rapid-border-brand-primary {"));
  });

  it("generates directional spacing", () => {
    assert.ok(css.includes(".rapid-px-md {"));
    assert.ok(css.includes(".rapid-py-sm {"));
    assert.ok(css.includes(".rapid-mt-lg {"));
  });

  it("generates opacity utilities", () => {
    assert.ok(css.includes(".rapid-opacity-disabled {"));
  });

  it("generates z-index utilities", () => {
    assert.ok(css.includes(".rapid-z-modal {"));
  });

  it("generates focus-ring utility", () => {
    assert.ok(css.includes(".rapid-focus-ring:focus-visible {"));
  });

  it("generates leading (line-height) utilities", () => {
    assert.ok(css.includes(".rapid-leading-normal {"));
  });

  it("generates tracking (letter-spacing) utilities", () => {
    assert.ok(css.includes(".rapid-tracking-tight {"));
  });
});

describe("Fluent v9 adapter", () => {
  let content;
  before(() => {
    content = fs.readFileSync(path.join(ROOT, "packages/fluent-adapter/index.ts"), "utf-8");
  });

  it("imports Theme type", () => {
    assert.ok(content.includes('import type { Theme }'));
  });

  it("maps brand tokens", () => {
    assert.ok(content.includes("colorBrandBackground"));
    assert.ok(content.includes("var(--rapid-color-brand-primary)"));
  });

  it("maps disabled tokens", () => {
    assert.ok(content.includes("colorNeutralForegroundDisabled"));
  });

  it("maps focus tokens", () => {
    assert.ok(content.includes("colorStrokeFocus2"));
  });

  it("maps duration tokens", () => {
    assert.ok(content.includes("durationFast"));
  });
});

describe("Fluent v8 adapter", () => {
  let content;
  before(() => {
    content = fs.readFileSync(path.join(ROOT, "packages/fluent-v8-adapter/index.ts"), "utf-8");
  });

  it("exports palette, semanticColors, effects, fonts, and theme", () => {
    assert.ok(content.includes("rapidFluentV8Palette"));
    assert.ok(content.includes("rapidFluentV8SemanticColors"));
    assert.ok(content.includes("rapidFluentV8Effects"));
    assert.ok(content.includes("rapidFluentV8Fonts"));
    assert.ok(content.includes("rapidFluentV8Theme"));
  });

  it("v8 and v9 point to the same brand-primary variable", () => {
    const v9 = fs.readFileSync(path.join(ROOT, "packages/fluent-adapter/index.ts"), "utf-8");
    assert.ok(content.includes("var(--rapid-color-brand-primary)"));
    assert.ok(v9.includes("var(--rapid-color-brand-primary)"));
  });
});

describe("Tailwind preset", () => {
  let content;
  before(() => {
    content = fs.readFileSync(path.join(ROOT, "packages/adapters/tailwind-preset.js"), "utf-8");
  });

  it("uses array format for fontFamily", () => {
    assert.ok(content.includes('"var(--rapid-font-family-base)"'));
    assert.ok(content.includes('[\n'));
  });

  it("includes fontWeight", () => {
    assert.ok(content.includes("fontWeight"));
    assert.ok(content.includes("var(--rapid-font-weight-semibold)"));
  });

  it("includes opacity and zIndex", () => {
    assert.ok(content.includes("opacity"));
    assert.ok(content.includes("zIndex"));
  });
});

describe("CSS Custom Data", () => {
  it("is valid JSON with properties array", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(ROOT, ".vscode/rapid-tokens.css-data.json"), "utf-8"),
    );
    assert.equal(data.version, 1.1);
    assert.ok(Array.isArray(data.properties));
    assert.ok(data.properties.length > 50);
  });

  it("color tokens have syntax: <color>", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(ROOT, ".vscode/rapid-tokens.css-data.json"), "utf-8"),
    );
    const brandPrimary = data.properties.find((p) => p.name === "--rapid-color-brand-primary");
    assert.ok(brandPrimary);
    assert.equal(brandPrimary.syntax, "<color>");
    assert.ok(brandPrimary.description.includes("Light:"));
    assert.ok(brandPrimary.description.includes("Dark:"));
  });
});
