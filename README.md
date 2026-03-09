<p align="center">
  <strong>R D S</strong><br>
  <sub>Rapid Design System</sub>
</p>

<p align="center">
  One JSON file controls every colour, font, and shadow across your entire app.<br>
  React, Bootstrap, AG Grid, Highcharts, dark mode &mdash; all in sync, instantly.
</p>

<p align="center">
  <a href="https://wallissam.github.io/Rapid-Design-System/rapid-design-system/demo/">Live Demo</a>
</p>

---

## 30-Second Recipes

**Theme a React + Fluent UI app:**

```tsx
import "rapid-design-system/css/global.css";
import { RapidFluentProvider } from "rapid-design-system/fluent/provider";

<RapidFluentProvider>
  <App />
</RapidFluentProvider>
```

**Theme AG Grid / Bootstrap / any CSS library:**

```js
import "rapid-design-system/css/global.css";
import "rapid-design-system/adapters/ag-grid.css";      // load after ag-grid's CSS
import "rapid-design-system/adapters/bootstrap5.css";    // load after bootstrap's CSS
```

**Toggle dark mode (one line):**

```js
document.documentElement.setAttribute("data-theme", "dark");
```

**Zero-install (CDN):**

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/rapid-design-system/packages/css/global.css">
```

---

## What Is This?

Most apps theme each library separately &mdash; Fluent UI has `createTheme()`, Bootstrap has `--bs-*` variables, AG Grid has `--ag-*` variables, Highcharts has its own options object. Change the brand colour and you're editing five files.

**RDS replaces all of that with one JSON file.** You define your tokens once in `tokens/base.json`. The build script compiles them into CSS custom properties that every library reads. Change a value, run `npm run build`, and Bootstrap, Fluent UI v8, Fluent UI v9, AG Grid, Chart.js, and 10 other libraries all update.

Dark mode is a single `data-theme="dark"` attribute on `<html>`. No React context, no JavaScript theming, no re-renders. The browser's CSS engine swaps the variables and every component repaints in unison.

---

## Quick Start

```bash
npm install rapid-design-system
```

Then import the CSS in your app's entry point:

```js
import "rapid-design-system/css/global.css";
```

That's it. Every `--rapid-*` CSS variable is now available. Dark mode works. Utility classes work.

### From Source (Contributors)

```bash
git clone https://github.com/wallissam/Rapid-Design-System.git
cd Rapid-Design-System/rapid-design-system
npm run build     # compiles JSON → all outputs
npm run demo      # interactive playground at localhost:3000/demo/
```

Zero dependencies. The build script is plain Node.js.

---

## How Do I...

### Rebrand?

```bash
cp tokens/local.example.json tokens/local.json
```

Edit `tokens/local.json` with your brand colours:

```json
{
  "color": {
    "brand": {
      "primary": "#e74c3c",
      "secondary": "#c0392b",
      "tertiary": "#a93226"
    }
  }
}
```

```bash
npm run build
```

Done. Every adapter, every component, every utility class updates.

### Add a Custom Token?

Add it to `tokens/local.json`:

```json
{
  "color": { "accent": { "coral": "#ff6b6b" } }
}
```

After `npm run build`, you get:
- CSS variable: `--rapid-color-accent-coral`
- Utility classes: `.rapid-bg-accent-coral`, `.rapid-text-accent-coral`, `.rapid-border-accent-coral`
- Tailwind: `bg-accent-coral`, `text-accent-coral`

### Theme Multiple Brands?

Drop a JSON file in `tokens/themes/`:

```json
// tokens/themes/contoso.json
{ "color": { "brand": { "primary": "#7c3aed" } } }
```

```bash
npm run build
```

Switch brands at runtime:

```html
<html data-theme="contoso">
```

### Load a Theme Dynamically (Multi-Tenant SaaS)?

```ts
import { loadThemeFromURL, setMode } from "rapid-design-system/runtime/theme-engine";

await loadThemeFromURL("/api/tenant/acme/theme.json");
setMode("auto");  // follows system preference
```

### Migrate from Fluent UI Theming?

Before (separate theme management):

```tsx
const myTheme = createTheme({ palette: { themePrimary: "#0f6cbd", ... } });
<ThemeProvider theme={myTheme}>
```

After (Rapid manages it):

```tsx
import "rapid-design-system/css/global.css";
import { RapidFluentV8Provider } from "rapid-design-system/fluent-v8/provider";

<RapidFluentV8Provider>
  <App />   {/* same components, zero changes */}
</RapidFluentV8Provider>
```

Delete your old `createTheme()` call and palette file. Dark mode is now `data-theme="dark"` instead of a context swap.

---

## npm Scripts

### Core

| Command | Description |
|---|---|
| `npm run build` | Compile JSON tokens into all downstream artefacts |
| `npm run demo` | Serve the interactive demo at `localhost:3000/demo/` |

### Quality

| Command | Description |
|---|---|
| `npm run check:contrast` | WCAG 2.1 contrast audit for all text/background pairs |
| `npm run audit -- ./src` | Scan a codebase for token adoption vs. hardcoded values |

### Design Integration

| Command | Description |
|---|---|
| `npm run sync:figma` | Pull variables from the Figma API into `tokens/` |
| `npm run sync` | Pull from Figma + build (full pipeline) |
| `npm run import:tokens-studio -- <file>` | Transform a Tokens Studio JSON export |
| `npm run generate:dark` | Auto-derive `dark.json` from `base.json` using colour science |

### Platform Export

| Command | Description |
|---|---|
| `npm run export:native` | Generate React Native, iOS (Swift), and Android (Kotlin) tokens |

---

<details>
<summary><strong>Dark Mode</strong></summary>

Set the attribute. That's it.

```html
<html data-theme="dark">
```

Every CSS variable, every adapter, every component responds instantly. Toggle from JS:

```js
document.documentElement.setAttribute("data-theme", "dark");
```

Or follow system preference automatically:

```ts
import { setMode } from "rapid-design-system/runtime/theme-engine";
setMode("auto");
```

Dark mode values live in `tokens/dark.json` (only values that differ from light). Run `npm run generate:dark` to auto-derive a starting point from your light tokens.

</details>

<details>
<summary><strong>Fluent UI v8 + v9 Coexistence</strong></summary>

Both adapters resolve through the **same** `--rapid-*` CSS variables:

```
v9  colorBrandBackground      ─┐
                                ├─►  var(--rapid-color-brand-primary)
v8  palette.themePrimary       ─┘
```

```tsx
import "rapid-design-system/css/global.css";
import { RapidFluentV8Provider } from "rapid-design-system/fluent-v8/provider";
import { RapidFluentProvider } from "rapid-design-system/fluent/provider";

<RapidFluentV8Provider>
  <DetailsList items={rows} />
  <RapidFluentProvider>
    <Button appearance="primary">Save</Button>
  </RapidFluentProvider>
</RapidFluentV8Provider>
```

Flip `data-theme="dark"` and both repaint simultaneously.

</details>

<details>
<summary><strong>Adapters (15 Libraries)</strong></summary>

### CSS Adapters (load after the library's CSS)

| Adapter | Library | Prefix Overridden |
|---|---|---|
| `adapters/bootstrap5.css` | Bootstrap 5.3+ | `--bs-*` |
| `adapters/ag-grid.css` | AG Grid | `--ag-*` |
| `adapters/fullcalendar.css` | FullCalendar v6 | `--fc-*` |
| `adapters/telerik-kendo.css` | Kendo UI | `--kendo-*` |
| `adapters/sweetalert2.css` | SweetAlert2 | `--swal2-*` |
| `adapters/devextreme.css` | DevExtreme | `--dx-*` |
| `adapters/primereact.css` | PrimeReact / PrimeVue | `--primary-*` |
| `adapters/bryntum.css` | Bryntum Grid / Scheduler | `--b-*` |
| `adapters/highcharts.css` | Highcharts styled mode | `.highcharts-*` classes |
| `adapters/spfx.css` | SharePoint Framework | `--themePrimary` et al. |

### JS Adapters (for canvas-based libraries)

| Adapter | Library |
|---|---|
| `adapters/chartjs` | Chart.js &mdash; patches defaults + auto-repaints on theme change |
| `adapters/highcharts` | Highcharts &mdash; `setOptions()` bridge for non-styled mode |
| `adapters/css-vars-bridge` | Shared utility: `token()`, `palette()`, `onThemeChange()` |
| `adapters/pcf-theme-bridge` | Power Apps PCF control injection |
| `adapters/tailwind-preset` | Tailwind CSS preset: `presets: [require("rapid-design-system/adapters/tailwind-preset")]` |

</details>

<details>
<summary><strong>Extensibility</strong></summary>

### Build-Time &mdash; `tokens/local.json`

Deep-merged onto `base.json`. Override values or add new tokens. New tokens automatically get CSS variables, utility classes, and Tailwind entries.

### Semantic Aliasing

Token values starting with `$` reference other tokens:

```json
{ "color": { "action": { "primary": "$color.brand.primary" } } }
```

Resolved at build time. Enables intent layers without duplicating values.

### CSS-Time &mdash; Scoped Overrides

Override tokens for a page section without rebuilding:

```css
.billing-section { --rapid-color-brand-primary: #0e7a0d; }
```

### Runtime &mdash; Theme Engine

```ts
import { applyTheme, loadThemeFromURL } from "rapid-design-system/runtime/theme-engine";
applyTheme({ color: { brand: { primary: "#e74c3c" } } });
```

</details>

<details>
<summary><strong>Figma Integration</strong></summary>

### Figma Variables API (Enterprise / Org plans)

```bash
cp .figmarc.example.json .figmarc.json   # add your file key
export FIGMA_TOKEN=figd_xxxx
npm run sync                              # pull + build
```

### Tokens Studio (all Figma plans)

```bash
npm run import:tokens-studio -- path/to/export.json
npm run build
```

Auto-detects single/multi-set exports, remaps naming conventions, resolves references, converts font weights to numeric, formats shadows to CSS shorthand.

</details>

<details>
<summary><strong>Cross-Platform (React Native, iOS, Android)</strong></summary>

```bash
npm run export:native
```

Generates from the same `base.json` + `dark.json`:

| Platform | Output | Features |
|---|---|---|
| React Native | `packages/native/tokens.ts` | `rapidTokens` + `useRapidTokens(scheme)` hook |
| iOS | `packages/native/RapidTokens.swift` | `UIColor` with dynamic light/dark trait support |
| Android | `packages/native/RapidTokens.kt` | Jetpack Compose `Color`, `dp`, `sp` |

</details>

<details>
<summary><strong>Quality Gates</strong></summary>

### WCAG Contrast Audit

```bash
npm run check:contrast            # check light + dark
npm run check:contrast -- --strict  # exit 1 on AA failure (CI gate)
npm run check:contrast -- --aaa     # check AAA level (7.0:1)
```

Validates 23 text/background pairs in both modes.

### Token Usage Audit

```bash
npm run audit -- ./src
```

```
Token Adoption:  ████████████████████░░░░░░░░░░░  60.6%
Tokens used:     40 / 66
Hardcoded values: 57
```

`--format json` for CI dashboards. `--strict` to fail if adoption &lt; 100%.

</details>

<details>
<summary><strong>Publishing to npm</strong></summary>

```bash
npm login                     # one-time
cd rapid-design-system
npm run build
npm publish                   # or: npm publish --access public (for scoped names)
```

Update: `npm version patch && npm publish`

The `prepublishOnly` script runs the build automatically. The package ships only consumable artefacts (CSS, adapters, tokens, LICENSE, README). Scripts, demo, and config files are excluded.

</details>

<details>
<summary><strong>Token Reference</strong></summary>

### Colors

| Token | Light | Dark |
|---|---|---|
| `color.brand.primary` | `#0f6cbd` | `#479ef5` |
| `color.brand.secondary` | `#115ea3` | `#62abf5` |
| `color.brand.tertiary` | `#0078d4` | `#2886de` |
| `color.surface.base` | `#ffffff` | `#1b1b1b` |
| `color.surface.raised` | `#fafafa` | `#2d2d2d` |
| `color.surface.overlay` | `#f5f5f5` | `#383838` |
| `color.surface.disabled` | `#f0f0f0` | `#2a2a2a` |
| `color.text.primary` | `#242424` | `#e0e0e0` |
| `color.text.secondary` | `#616161` | `#adadad` |
| `color.text.disabled` | `#a0a0a0` | `#5c5c5c` |
| `color.text.on-brand` | `#ffffff` | `#ffffff` |
| `color.text.link` | `#0f6cbd` | `#479ef5` |
| `color.border.default` | `#d1d1d1` | `#484848` |
| `color.border.strong` | `#ababab` | `#6a6a6a` |
| `color.focus.ring` | `#0f6cbd` | `#479ef5` |
| `color.status.info` | `#0078d4` | `#479ef5` |
| `color.status.success` | `#0e7a0d` | `#54b054` |
| `color.status.warning` | `#f7630c` | `#f98845` |
| `color.status.danger` | `#b10e1c` | `#e34e5e` |

### Spacing

`spacing.xs` (4px) &rarr; `spacing.2xl` (48px)

### Typography

`font.size.xs` (10px) &rarr; `font.size.2xl` (32px) &bull; `font.weight.regular` (400), `.semibold` (600), `.bold` (700) &bull; `font.line-height.tight` (1.2), `.normal` (1.5), `.relaxed` (1.75) &bull; `font.letter-spacing.tight` (-0.02em), `.normal` (0), `.wide` (0.05em)

### Other

`radius.sm` (2px) &rarr; `radius.round` (9999px) &bull; `border.width.thin` (1px), `.thick` (2px) &bull; `shadow.sm` / `.md` / `.lg` &bull; `opacity.disabled` (0.4), `.hover` (0.9), `.subtle` (0.7) &bull; `duration.fast` (100ms), `.normal` (200ms), `.slow` (400ms) &bull; `z.dropdown` (1000) &rarr; `z.toast` (1500)

</details>

---

## License

MIT

