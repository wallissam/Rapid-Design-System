# Changelog

All notable changes to the Rapid Design System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-03-09

### Added

- **Token Schema** — 45+ semantic tokens covering colors (brand, surface, text, border, focus, status), spacing (6 steps), typography (family, size, weight, line-height, letter-spacing), border radius, border width, shadows, focus ring, opacity, transition duration, and z-index layers.
- **Dark Mode** — Pure CSS via `data-theme="dark"` attribute. Zero JavaScript theming.
- **CSS Output** — `global.css` (:root + dark custom properties), `utilities.css` (color, spacing, radius, shadow, typography, opacity, z-index, duration, focus-ring utilities), `scoped-overrides.css` (editable template).
- **Fluent UI v9 Adapter** — 100+ theme token mappings + `<RapidFluentProvider>` wrapper.
- **Fluent UI v8 Adapter** — Full IPalette (37 slots) + ISemanticColors (88 slots) + IEffects + IFontStyles + `<RapidFluentV8Provider>` wrapper. Keeps v8 and v9 in perfect visual sync.
- **15 Third-Party Adapters** — Bootstrap 5, AG Grid, FullCalendar, Telerik/Kendo, SweetAlert2, DevExtreme, PrimeReact, Bryntum, Highcharts (CSS + JS), Chart.js, SPFx, PCF, Tailwind CSS preset.
- **Extensibility** — `tokens/local.json` for build-time overrides/extensions, CSS scoped overrides for runtime, `_css-vars-bridge.ts` for programmatic access.
- **Figma Integration** — `sync-figma.js` (Variables REST API) + `import-tokens-studio.js` (Tokens Studio plugin export).
- **Interactive Demo** — Live token editor, dark/light toggle, 12-section component showcase.
- **Security Hardening** — Prototype pollution guards, CSS injection sanitisation, CSP headers, input validation, response size bounding.
