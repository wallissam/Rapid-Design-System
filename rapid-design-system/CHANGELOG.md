# Changelog

All notable changes to the Rapid Design System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Codemod** (`scripts/migrate.js`) — Scans a codebase and replaces hardcoded hex colours, spacing, font sizes, radii, shadows, and font families with `var(--rapid-*)` references. Dry-run by default, `--apply` to write.
- **Contrast Auto-Suggest** — `check-contrast.js` now suggests the nearest WCAG-compliant colour for every failing pair using HSL binary search.
- **JSON Schema** (`scripts/generate-schema.js`) — Generates `tokens/token-schema.json` for IDE validation of token files.
- **Motion Tokens** — `easing.default`, `.in`, `.out`, `.spring` (cubic-bezier curves) added to `base.json`.
- **Console Bridge** (`packages/runtime/console.js`) — `window.rds` API for DevTools: `get`, `set`, `dark`, `light`, `toggle`, `list`, `search`, `diff`, `reset`, `export`, `import`, `help`. Auto-generated with full token catalog baked in.
- **Browser Extension** (`browser-extension/`) — Chrome/Edge Manifest V3. Detects RDS tokens, injects floating palette inspector with colour pickers, hex inputs, per-token reset, collapsible groups, dark mode toggle, import/export, share URL with encoded overrides, per-domain persistence.
- **VS Code Extension** (`vscode-extension/`) — Autocomplete for `var(--rapid-*` and `.rapid-*` classes, hover info with light/dark values, diagnostics for hardcoded hex colours, one-click quick-fix replacement.
- **CSS Custom Data** — Build generates `.vscode/rapid-tokens.css-data.json` for instant VS Code autocomplete without extension install.
- **Figma Plugin** (`figma-plugin/`) — Import (JSON → Figma Variables with Light/Dark modes), Export (Variables → RDS JSON), Lint (scan selection for off-system colours). Zero build step.
- **Chart.js Demo Integration** — Live bar + doughnut charts themed via JS bridge, re-render on every token change and dark mode toggle.
- **SweetAlert2 Demo Integration** — Success, confirmation, error modals and toast notification, all themed via CSS adapter.
- **GitHub Pages Landing Page** (`index.html`) — Clean landing with feature cards, links to demo and GitHub.
- **GitHub Actions CI** — Unit tests, Playwright E2E, quality gates (contrast check + token audit) on every push.
- **Test Framework** — 60 unit tests (Node.js `node:test`) covering build output, security invariants, alias resolution, Tailwind format, CSS custom data. 21 Playwright E2E tests covering demo rendering, dark mode, token editor, Chart.js, SweetAlert2, visual regression.
- **Cross-Platform Export** (`scripts/export-native.js`) — React Native TypeScript, iOS Swift (`UIColor` with dynamic light/dark trait), Android Kotlin (Jetpack Compose `Color`, `dp`, `sp`).
- **Runtime Theme Engine** (`packages/runtime/theme-engine.ts`) — Dynamic theme loading (`loadThemeFromURL`), system preference following (`setMode("auto")`), named brand switching, theme composition.
- **Multi-Brand Themes** — `tokens/themes/*.json` compile to `[data-theme="name"]` CSS blocks.
- **Semantic Token Aliasing** — `$` prefix references resolve at build time: `"$color.brand.primary"`.

### Changed

- **Fluent v9 adapter** expanded from 35 to 96 token mappings (compound brand, disabled, focus, strokes, link colours, line-height, durations).
- **Utility classes** — Fixed `.rapid-text-text-primary` → `.rapid-text-primary`. Added border-color (`.rapid-border-*`), directional spacing (`px`, `py`, `pt`, `pr`, `pb`, `pl`, `mx`, `my`, etc.), leading, tracking, opacity, z-index, duration, and focus-ring utilities.
- **Tailwind preset** — Fixed `fontFamily` to array format. Added `fontWeight`, `lineHeight`, `letterSpacing`, `opacity`, `zIndex`, `transitionDuration`.
- **AG Grid adapter** — Selection row uses `color-mix()` at 15% opacity instead of solid brand.
- **Bootstrap adapter** — Added `--bs-secondary`, `--bs-info`, `--bs-light`, `--bs-dark`. Links use `text.link` token.
- **Token schema** — Added `color.status.info`, `color.surface.disabled`, `color.text.disabled`, `color.text.link`, `color.text.link-hover`, `color.focus.ring`, `font.line-height.*`, `font.letter-spacing.*`, `border.width.*`, `opacity.*`, `duration.*`, `z.*`, `focus.width`, `focus.offset`, `easing.*`.
- **Alias resolution** now happens after local.json merge so `$` refs in local files resolve against base tokens.
- **README** rewritten with progressive disclosure, collapsible sections, 30-second recipes, migration guide.
- **Demo page** — Added radio buttons, checkboxes, disabled inputs, info alert, token-driven opacity.

### Security

- Prototype pollution guards on all object iteration (`__proto__`, `constructor`, `prototype`).
- CSS injection sanitisation (`sanitizeCSSValue`, `validateTokenKey`).
- Demo page: all `innerHTML` replaced with safe DOM APIs; CSP meta tag added.
- PCF bridge: cross-origin URL validation for `cssHref`.
- Figma sync: response size bounded to 50 MB; error messages sanitised; fileKey validated.
- Bridge utilities use `Object.create(null)` for accumulators.

## [0.1.0] — 2026-03-09

### Added

- Initial token pipeline: `base.json` → `global.css` + `utilities.css` via `build-tokens.js`.
- Fluent UI v9 adapter + `<RapidFluentProvider>`.
- Fluent UI v8 adapter + `<RapidFluentV8Provider>`.
- 8 CSS variable override adapters (Bootstrap 5, AG Grid, FullCalendar, Kendo, SweetAlert2, DevExtreme, PrimeReact, Bryntum).
- Highcharts CSS + JS adapters, Chart.js JS adapter.
- SPFx CSS adapter, PCF TypeScript bridge.
- Tailwind CSS preset.
- `_css-vars-bridge.ts` shared utility.
- `tokens/local.json` extensibility + `scoped-overrides.css` template.
- Figma sync (`sync-figma.js`) + Tokens Studio import (`import-tokens-studio.js`).
- Dark mode via `data-theme="dark"` attribute.
- Interactive demo page with live token editor.
