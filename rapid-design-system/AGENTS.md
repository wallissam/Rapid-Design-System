# Agent Guide — Rapid Design System

This document helps AI coding assistants understand the project's architecture, conventions, and extension patterns. Read this before making changes.

## Project Intent

RDS is a **token governance layer**, not a component library. It compiles JSON design tokens into CSS custom properties and framework-specific adapters. The intent is that one JSON change propagates to every UI library (Fluent UI, Bootstrap, AG Grid, Chart.js, etc.) without editing multiple theme files.

**The non-negotiable constraint:** dark mode and all theming is handled via CSS custom properties and the `data-theme` HTML attribute. No JavaScript theme context, no React state for colours, no runtime colour computation. The browser's CSS engine is the theming runtime.

## Architecture

```
Source of Truth          Build Pipeline              Outputs (auto-generated)
─────────────           ──────────────              ────────────────────────
tokens/base.json   ──┐
tokens/dark.json   ──┤  scripts/build-tokens.js    packages/css/global.css
tokens/local.json  ──┤  (npm run build)         →  packages/css/utilities.css
tokens/themes/*.json ┘                              packages/fluent-adapter/*
                                                    packages/fluent-v8-adapter/*
                                                    packages/adapters/* (15 files)
                                                    packages/css/scoped-overrides.css
```

Everything in `packages/` is generated. Never edit those files directly.

## Key Files

| File | Role | Edit? |
|---|---|---|
| `tokens/base.json` | Light theme token values | Yes — this is the source of truth |
| `tokens/dark.json` | Dark mode overrides (only diffs) | Yes |
| `tokens/local.json` | Consumer overrides + extensions | Yes (optional, gitignored in some setups) |
| `tokens/themes/*.json` | Named brand themes | Yes |
| `scripts/build-tokens.js` | Core build pipeline | Yes — this is where adapters/utilities are defined |
| `scripts/sync-figma.js` | Figma Variables API sync | Yes |
| `scripts/import-tokens-studio.js` | Tokens Studio import | Yes |
| `scripts/generate-dark.js` | Auto dark mode derivation | Yes |
| `scripts/check-contrast.js` | WCAG contrast audit | Yes |
| `scripts/audit-tokens.js` | Token usage governance audit | Yes |
| `scripts/export-native.js` | RN/iOS/Android export | Yes |
| `packages/**` | Generated outputs | **No — edit build-tokens.js instead** |
| `demo/index.html` | Interactive demo page | Yes (but uses no innerHTML — DOM APIs only) |
| `package.json` | npm config, scripts, exports map | Yes |

## Token → CSS Variable Naming

JSON nesting maps to hyphenated CSS variable names with a `rapid` prefix:

```
{ "color": { "brand": { "primary": "#0f6cbd" } } }
                ↓
--rapid-color-brand-primary: #0f6cbd;
```

This is deterministic. Given any JSON path, you can predict the CSS variable name.

## Adding a Token

1. Add the value to `tokens/base.json` at the appropriate nesting level
2. If it should differ in dark mode, add the override to `tokens/dark.json`
3. Run `npm run build`

The build automatically generates:
- CSS variable in `global.css`
- Utility classes in `utilities.css` (if the token falls under a known category: color, spacing, radius, shadow, font, opacity, z, duration)
- Tailwind preset entry (same categories)

You do NOT need to edit any adapter unless you want to map the new token to a specific library's variable name.

## Adding an Adapter

All adapters are functions in `scripts/build-tokens.js`. Each function returns a string (the file content). The function is called in `main()` and the result is written via `emit()`.

### CSS adapter template (for libraries with CSS custom properties):

```javascript
function buildMyLibAdapter() {
  return `${fileHeader("My Library Adapter", [
    "What this adapter does.",
    "Load AFTER the library CSS.",
  ])}

:root {
  --lib-background: ${v("color-surface-base")};
  --lib-text: ${v("color-text-primary")};
  --lib-primary: ${v("color-brand-primary")};
  --lib-border: ${v("color-border-default")};
  --lib-font-family: ${v("font-family-base")};
  --lib-font-size: ${v("font-size-md")};
  --lib-radius: ${v("radius-md")};
  --lib-shadow: ${v("shadow-md")};
}
`;
}
```

### JS bridge template (for canvas/imperative libraries):

```javascript
function buildMyLibJSAdapter() {
  return `${fileHeader("My Library JS Bridge").replace(/\/\*/g, "//").replace(/\*\//g, "//").replace(/ \* /g, "// ")}

import { token, tokenNumeric, palette, onThemeChange } from "./_css-vars-bridge";

export function applyRapidMyLibTheme(MyLib: any): void {
  MyLib.defaults.color = token("color-text-primary");
  MyLib.defaults.backgroundColor = token("color-surface-base");
  MyLib.defaults.fontFamily = token("font-family-base");
  MyLib.defaults.fontSize = tokenNumeric("font-size-md");
}
`;
}
```

### Registration checklist:

1. Add the builder function to `build-tokens.js`
2. Add an `emit()` call in `main()` under the appropriate section
3. Add to `package.json` `"exports"` map
4. Update the adapter count in the build complete message

## Helper Functions

These are defined in `build-tokens.js` and used throughout:

| Function | Returns | Use for |
|---|---|---|
| `v("token-key")` | `var(--rapid-token-key)` | CSS adapter templates |
| `toCSSVar("key")` | `--rapid-key` | Raw CSS property names |
| `flatten(obj, prefix)` | `[["prefix-key", "value"], ...]` | Iterating tokens |
| `fileHeader(title, lines)` | Comment block string | Top of every generated file |
| `emit(path, content)` | void (writes file) | Output step in main() |
| `sanitizeCSSValue(val)` | Validated string | CSS output safety |
| `validateTokenKey(key)` | boolean | CSS key safety |
| `deepMerge(target, source)` | Merged object | Token file merging |
| `resolveAliases(obj)` | Resolved object | $-reference resolution |

## Semantic Aliasing

Token values starting with `$` are resolved to other token values at build time:

```json
{ "color": { "action": { "primary": "$color.brand.primary" } } }
```

The dot-path after `$` maps to the JSON nesting. Resolution happens before any output is generated, so adapters see the resolved value.

## Security Rules

These are non-negotiable. Every PR should maintain them:

1. **Prototype pollution**: Every `for (const [key, val] of Object.entries(obj))` loop MUST skip `__proto__`, `constructor`, `prototype`. Use `isSafeKey(key)` or check against `UNSAFE_KEYS`.

2. **CSS injection**: Every value written to CSS MUST pass `sanitizeCSSValue()`. Every key MUST pass `validateTokenKey()`. These reject `;`, `{`, `}`, `\`, `<`, `>`.

3. **No innerHTML**: The demo page uses `createElement` + `textContent` + `setAttribute`. Never use `innerHTML` or template literal HTML interpolation with dynamic values.

4. **JSON parsing**: Always wrap `JSON.parse` in try/catch with a clean error message.

5. **User input validation**: The demo page validates colour inputs against `/^#[0-9a-fA-F]{6}$/` before applying.

6. **URL validation**: The PCF bridge validates `cssHref` against cross-origin URLs.

## Testing Changes

After any change, verify with:

```bash
npm run build                    # must produce 22+ artefacts without warnings
npm run check:contrast           # should not introduce new failures
npm run check:contrast --strict  # CI gate — exits 1 on any AA failure
npm run audit -- ./demo          # reports token adoption in the demo page
```

## Common Tasks — Decision Tree

**"I need to change a colour"** → Edit `tokens/base.json` (and `dark.json` if dark differs) → `npm run build`

**"I need to add a token that doesn't exist"** → Add to `base.json` → add dark override to `dark.json` if needed → `npm run build` → new CSS var and utility classes appear automatically

**"I need to support a new CSS library"** → Add a builder function to `build-tokens.js` → register in `main()` → add to `package.json` exports → `npm run build`

**"I need to support a new canvas/JS library"** → Same as above, but the builder emits TypeScript that imports from `_css-vars-bridge.ts`

**"I need to add a new utility class pattern"** → Edit `buildUtilitiesCSS()` in `build-tokens.js` → follow existing iteration pattern

**"I need to map a token to a Fluent UI slot"** → Edit the `map` object in `buildFluentAdapter()` (v9) or the palette/semanticColors objects in `buildFluentV8Adapter()` (v8) → `npm run build`

**"I need to add a named brand theme"** → Create `tokens/themes/brandname.json` with override values → `npm run build` → use `data-theme="brandname"`

**"I need to extend the Tailwind preset"** → Edit `buildTailwindPreset()` in `build-tokens.js` → the preset auto-generates from token categories

**"I need to update the demo page"** → Edit `demo/index.html` directly → use `createElement`/`textContent` for dynamic content, never `innerHTML`

## File Naming Conventions

- Token files: lowercase, hyphens (`base.json`, `local-dark.json`)
- CSS adapters: lowercase, hyphens (`ag-grid.css`, `bootstrap5.css`)
- TS/JS adapters: lowercase, hyphens (`chartjs.ts`, `pcf-theme-bridge.ts`)
- Shared utilities: underscore prefix (`_css-vars-bridge.ts`)
- Native outputs: PascalCase for Swift/Kotlin (`RapidTokens.swift`), camelCase for TS (`tokens.ts`)

## Figma Plugin

Located in `figma-plugin/`. Three files, zero build step:

| File | Role |
|---|---|
| `manifest.json` | Plugin metadata (name, capabilities, entry points) |
| `code.js` | Figma sandbox code — access to Variables API, document nodes |
| `ui.html` | Plugin UI panel — tabs for Import, Export, Lint |

**Import:** Paste `base.json` + `dark.json` → creates/updates a "Rapid Design System" Variable Collection with Light + Dark modes. Creates COLOR variables for hex values, FLOAT for numeric values.

**Export:** Reads Figma Variables → outputs RDS-format JSON. Copy into `tokens/base.json`.

**Lint:** Select frames → scans all fills and strokes → flags colours not in the token set.

Communication: `code.js` ↔ `ui.html` via `figma.ui.postMessage()` / `window.onmessage`.

To test locally: Figma > Plugins > Development > Import plugin from manifest > select `figma-plugin/manifest.json`.

## What NOT To Do

- Don't edit files in `packages/` — they're overwritten on every build
- Don't use JavaScript/React context for theme switching
- Don't hardcode colour or spacing values in adapters (use `v("token-key")`)
- Don't add UI components — this is infrastructure, not a component library
- Don't skip security guards (prototype pollution, CSS injection)
- Don't add npm dependencies — the build is zero-dependency by design
