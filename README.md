<p align="center">
  <strong>R D S</strong><br>
  <sub>Rapid Design System</sub>
</p>

<p align="center">
  Framework-agnostic design token governance and synchronization layer.<br>
  One JSON source of truth &rarr; CSS variables &rarr; every framework, every component, every theme.
</p>

<p align="center">
  <code>npm run build</code>&ensp;&mdash;&ensp;compiles <strong>22 artefacts</strong> from two JSON files.
</p>

---

## What is RDS?

RDS is **not** a component library. It is a governance layer that ensures a single set of design tokens controls the visual appearance of everything on the page &mdash; raw HTML, React (Fluent UI v8 _and_ v9), PCF controls, SharePoint, and heavily DOM-manipulated libraries like Bryntum, AG Grid, and Highcharts.

**Core principle:** dark mode and theme switching are handled exclusively by a `data-theme` attribute on `<html>`. No JavaScript context, no React state, no runtime colour math. The browser's CSS engine resolves `var()` references, and every adapter &mdash; regardless of framework &mdash; updates in unison.

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/wallissam/Rapid-Design-System.git
cd Rapid-Design-System/rapid-design-system

# 2. Build all artefacts from the token source files
npm run build

# 3. Launch the interactive demo
npm run demo
# Open http://localhost:3000/demo/
```

No dependencies to install. The build script is plain Node.js with zero packages.

---

## Architecture

```
Figma Variables API ─┐
                     ├──► tokens/base.json ──► npm run build ──►  22 artefacts
Tokens Studio JSON ──┘    tokens/dark.json       │
                          tokens/local.json*      │  * optional overrides
                                                  │
                          ┌───────────────────────┘
                          │
    ┌─────────────────────┼─────────────────────────────────┐
    │                     │                                 │
    ▼                     ▼                                 ▼
  Core CSS            Fluent Adapters              Third-Party Adapters
  global.css          v9 index.ts + Provider       Bootstrap 5, AG Grid,
  utilities.css       v8 index.ts + Provider       FullCalendar, Kendo,
  scoped-overrides                                 Chart.js, Highcharts,
                                                   Bryntum, SweetAlert2,
                                                   DevExtreme, PrimeReact,
                                                   SPFx, PCF, Tailwind
```

### The Token Master Rule

Every colour, spacing value, radius, shadow, and font reference across the entire system traces back to `tokens/base.json`. If you change a value there and rebuild, the change propagates to CSS custom properties, utility classes, Fluent UI v8, Fluent UI v9, Bootstrap, AG Grid, Highcharts &mdash; everything.

---

## Project Structure

```
rapid-design-system/
├── tokens/
│   ├── base.json                  # Light theme source of truth
│   ├── dark.json                  # Dark mode overrides (values that differ)
│   ├── local.json*                # Optional: your overrides & extensions
│   ├── local-dark.json*           # Optional: dark overrides for custom tokens
│   ├── local.example.json         # Example showing override + extension patterns
│   └── local-dark.example.json
│
├── scripts/
│   ├── build-tokens.js            # Core build pipeline (JSON → 22 artefacts)
│   ├── sync-figma.js              # Pull tokens from Figma Variables API
│   └── import-tokens-studio.js    # Transform Tokens Studio exports
│
├── packages/
│   ├── css/
│   │   ├── global.css             # :root + [data-theme="dark"] custom properties
│   │   ├── utilities.css          # .rapid-* utility classes
│   │   └── scoped-overrides.css   # Template for CSS-level scoping (copy & edit)
│   │
│   ├── fluent-adapter/            # Fluent UI v9
│   │   ├── index.ts               # Theme object: every value is var(--rapid-*)
│   │   └── Provider.tsx           # <RapidFluentProvider> wrapper
│   │
│   ├── fluent-v8-adapter/         # Fluent UI v8
│   │   ├── index.ts               # IPalette + ISemanticColors + IEffects + IFontStyles
│   │   └── Provider.tsx           # <RapidFluentV8Provider> wrapper
│   │
│   └── adapters/                  # Third-party library adapters
│       ├── bootstrap5.css         ├── ag-grid.css
│       ├── fullcalendar.css       ├── telerik-kendo.css
│       ├── sweetalert2.css        ├── devextreme.css
│       ├── primereact.css         ├── bryntum.css
│       ├── highcharts.css         # Highcharts styled mode (CSS)
│       ├── highcharts.ts          # Highcharts non-styled mode (JS bridge)
│       ├── chartjs.ts             # Chart.js defaults + theme plugin
│       ├── _css-vars-bridge.ts    # Shared utility: read computed token values
│       ├── spfx.css               # SharePoint Framework theme slots
│       ├── pcf-theme-bridge.ts    # Power Apps PCF control bridge
│       └── tailwind-preset.js     # Tailwind CSS theme preset
│
├── demo/
│   └── index.html                 # Interactive playground with live token editor
│
├── .figmarc.example.json          # Figma sync configuration template
└── package.json
```

---

## npm Scripts

| Command | Description |
|---|---|
| `npm run build` | Compile JSON tokens into all 22 downstream artefacts |
| `npm run sync:figma` | Pull variables from the Figma API into `tokens/` |
| `npm run sync` | Pull from Figma + build (full pipeline) |
| `npm run import:tokens-studio -- <file>` | Transform a Tokens Studio JSON export |
| `npm run demo` | Serve the interactive demo at `localhost:3000/demo/` |

---

## Dark Mode

Set the attribute. That's it.

```html
<html data-theme="dark">
```

Every CSS variable, every adapter, every component on the page responds instantly. No JavaScript context swap, no React re-render. Toggle it from JS with a single line:

```js
document.documentElement.setAttribute("data-theme", "dark");
```

---

## Fluent UI v8 + v9 Coexistence

A page can render v8 `DetailsList` and v9 `Button` side by side. Both adapters resolve through the **same** `--rapid-*` CSS variables, so they stay in perfect visual sync:

```
v9  colorBrandBackground      ─┐
                                ├─►  var(--rapid-color-brand-primary)
v8  palette.themePrimary       ─┘
```

```tsx
import { RapidFluentV8Provider } from "./packages/fluent-v8-adapter/Provider";
import { RapidFluentProvider } from "./packages/fluent-adapter/Provider";

<RapidFluentV8Provider>
  <DetailsList items={rows} />        {/* v8 */}
  <RapidFluentProvider>
    <Button appearance="primary">Save</Button>  {/* v9 */}
  </RapidFluentProvider>
</RapidFluentV8Provider>
```

Flip `data-theme="dark"` and both repaint simultaneously.

---

## Adapters at a Glance

### CSS Variable Override Adapters

Load after the library's own CSS. The cascade does the rest.

| Adapter | Target Library | Prefix Overridden |
|---|---|---|
| `bootstrap5.css` | Bootstrap 5.3+ | `--bs-*` |
| `ag-grid.css` | AG Grid | `--ag-*` |
| `fullcalendar.css` | FullCalendar v6 | `--fc-*` |
| `telerik-kendo.css` | Kendo UI (all frameworks) | `--kendo-*` |
| `sweetalert2.css` | SweetAlert2 | `--swal2-*` |
| `devextreme.css` | DevExtreme | `--dx-*` |
| `primereact.css` | PrimeReact / PrimeFaces / PrimeVue | `--primary-*`, `--surface-*` |
| `bryntum.css` | Bryntum Grid / Scheduler / Gantt | `--b-*` |

### CSS Class Override Adapter

| Adapter | Target |
|---|---|
| `highcharts.css` | Highcharts styled mode &mdash; targets `.highcharts-*` SVG classes |

### JavaScript Bridge Adapters

For canvas-based libraries that need resolved values, not `var()` references.

| Adapter | Target |
|---|---|
| `_css-vars-bridge.ts` | Shared utility: `token()`, `tokens()`, `palette()`, `onThemeChange()` |
| `chartjs.ts` | Chart.js &mdash; patches defaults + auto-repaints on theme change |
| `highcharts.ts` | Highcharts non-styled mode &mdash; `setOptions()` bridge |

### Platform Adapters

| Adapter | Target |
|---|---|
| `spfx.css` | SharePoint Framework &mdash; overrides `--themePrimary` et al. |
| `pcf-theme-bridge.ts` | Power Apps PCF &mdash; injects tokens + reads computed values |

### Config Presets

| Adapter | Target |
|---|---|
| `tailwind-preset.js` | Tailwind CSS &mdash; `presets: [require("./tailwind-preset")]` |

---

## Extensibility

Three layers, each for a different need.

### 1. Build-Time &mdash; `tokens/local.json`

Override standard values or add entirely new tokens. The build script deep-merges `local.json` on top of `base.json`. New tokens automatically get CSS variables, utility classes, and Tailwind entries.

```json
{
  "color": {
    "brand": { "primary": "#e74c3c" },
    "accent": { "coral": "#ff6b6b", "teal": "#2ec4b6" }
  },
  "duration": { "fast": "100ms", "normal": "200ms" }
}
```

```
npm run build
  ✓ tokens/local.json loaded (1 override, 5 extensions)
```

### 2. CSS-Time &mdash; Scoped Overrides

Override tokens for a section of the page without rebuilding. CSS custom property inheritance handles the rest.

```css
.rapid-scope-billing {
  --rapid-color-brand-primary: #0e7a0d;
}
```

Everything inside &mdash; Fluent buttons, AG Grid selections, charts &mdash; turns green.

### 3. Runtime &mdash; `_css-vars-bridge.ts`

Read any `--rapid-*` variable (including custom ones) from JavaScript:

```ts
import { token, palette, onThemeChange } from "./_css-vars-bridge";

const bg = token("color-surface-base");    // "#ffffff"
const colors = palette();                   // [brand, success, warning, ...]

const cleanup = onThemeChange(() => {
  // Re-read tokens — dark mode just activated
});
```

---

## Figma Integration

### Figma Variables API (Enterprise / Org plans)

```bash
cp .figmarc.example.json .figmarc.json
# Edit .figmarc.json with your file key and mode names

export FIGMA_TOKEN=figd_xxxx
npm run sync                      # Pull → build in one step
```

### Tokens Studio (all Figma plans)

```bash
npm run import:tokens-studio -- path/to/export.json
npm run build
```

The import script auto-detects single-set vs multi-set exports, remaps Tokens Studio naming conventions (`fontFamilies` &rarr; `font.family`, `borderRadius` &rarr; `radius`, etc.), resolves token references, converts font weight names to numeric, and formats shadow objects to CSS shorthand.

---

## Token Reference

### Colors

| Token | Light | Dark |
|---|---|---|
| `color.brand.primary` | `#0f6cbd` | `#479ef5` |
| `color.brand.secondary` | `#115ea3` | `#62abf5` |
| `color.brand.tertiary` | `#0078d4` | `#2886de` |
| `color.surface.base` | `#ffffff` | `#1b1b1b` |
| `color.surface.raised` | `#fafafa` | `#2d2d2d` |
| `color.surface.overlay` | `#f5f5f5` | `#383838` |
| `color.text.primary` | `#242424` | `#e0e0e0` |
| `color.text.secondary` | `#616161` | `#adadad` |
| `color.text.on-brand` | `#ffffff` | `#ffffff` |
| `color.border.default` | `#d1d1d1` | `#484848` |
| `color.border.strong` | `#ababab` | `#6a6a6a` |
| `color.status.success` | `#0e7a0d` | `#54b054` |
| `color.status.warning` | `#f7630c` | `#f98845` |
| `color.status.danger` | `#b10e1c` | `#e34e5e` |

### Spacing

| Token | Value |
|---|---|
| `spacing.xs` | `4px` |
| `spacing.sm` | `8px` |
| `spacing.md` | `16px` |
| `spacing.lg` | `24px` |
| `spacing.xl` | `32px` |
| `spacing.2xl` | `48px` |

### Typography

| Token | Value |
|---|---|
| `font.family.base` | Segoe UI, -apple-system, system stack |
| `font.family.mono` | Cascadia Code, Fira Code, Consolas |
| `font.size.xs` &rarr; `font.size.2xl` | 10px &rarr; 32px |
| `font.weight.regular` | 400 |
| `font.weight.semibold` | 600 |
| `font.weight.bold` | 700 |

### Border Radius

| Token | Value |
|---|---|
| `radius.sm` | `2px` |
| `radius.md` | `4px` |
| `radius.lg` | `8px` |
| `radius.xl` | `12px` |
| `radius.round` | `9999px` |

### Shadow

| Token | Light | Dark |
|---|---|---|
| `shadow.sm` | `0 1px 2px rgba(0,0,0,.12)` | `0 1px 2px rgba(0,0,0,.40)` |
| `shadow.md` | `0 2px 4px rgba(0,0,0,.14)` | `0 2px 4px rgba(0,0,0,.44)` |
| `shadow.lg` | `0 8px 16px rgba(0,0,0,.14)` | `0 8px 16px rgba(0,0,0,.44)` |

---

## License

MIT

