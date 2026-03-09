/**
 * Rapid Design System — Runtime Theme Engine
 *
 * Enables dynamic theme loading without a rebuild. Consumers fetch
 * a theme JSON (from an API, a CDN, or a local file) and apply it
 * at runtime by injecting CSS custom properties into the document.
 *
 * Use cases:
 *   - Multi-tenant SaaS where each customer has brand colors
 *   - A/B testing brand variants
 *   - User-personalised themes
 *   - White-label deployments
 *
 * Usage:
 *
 *   import { applyTheme, loadThemeFromURL, setMode } from "rapid-design-system/runtime/theme-engine";
 *
 *   // From a JS object
 *   applyTheme({ color: { brand: { primary: "#e74c3c" } } });
 *
 *   // From a remote URL (e.g. per-tenant API)
 *   await loadThemeFromURL("/api/tenant/acme/theme.json");
 *
 *   // Toggle dark mode
 *   setMode("dark");
 *   setMode("light");
 *   setMode("auto");  // follows prefers-color-scheme
 */

const PREFIX = "rapid";

export interface ThemeTokens {
  [category: string]: string | ThemeTokens;
}

function flattenTokens(
  obj: ThemeTokens,
  parentKey = "",
): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key === "_comment") continue;
    const fullKey = parentKey ? `${parentKey}-${key}` : key;
    if (typeof value === "object" && value !== null) {
      entries.push(...flattenTokens(value as ThemeTokens, fullKey));
    } else {
      entries.push([fullKey, String(value)]);
    }
  }
  return entries;
}

/**
 * Apply a token object to the document root as CSS custom properties.
 * Only sets properties that differ from the current computed values,
 * minimising style recalculation.
 */
export function applyTheme(
  tokens: ThemeTokens,
  target: HTMLElement = document.documentElement,
): void {
  const entries = flattenTokens(tokens);
  const styles = getComputedStyle(target);

  for (const [key, value] of entries) {
    const prop = `--${PREFIX}-${key}`;
    const current = styles.getPropertyValue(prop).trim();
    if (current !== value) {
      target.style.setProperty(prop, value);
    }
  }
}

/**
 * Remove all inline Rapid token overrides from the target element,
 * reverting to the stylesheet-defined values.
 */
export function resetTheme(
  target: HTMLElement = document.documentElement,
): void {
  const style = target.style;
  const toRemove: string[] = [];
  for (let i = 0; i < style.length; i++) {
    if (style[i].startsWith(`--${PREFIX}-`)) {
      toRemove.push(style[i]);
    }
  }
  for (const prop of toRemove) {
    style.removeProperty(prop);
  }
}

/**
 * Fetch a theme JSON from a URL and apply it.
 * The JSON should have the same shape as tokens/base.json.
 */
export async function loadThemeFromURL(
  url: string,
  target: HTMLElement = document.documentElement,
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[RDS] Failed to load theme from ${url}: ${res.status}`);
  }
  const tokens: ThemeTokens = await res.json();
  applyTheme(tokens, target);
}

/**
 * Set the colour mode: "light", "dark", or "auto".
 * "auto" follows the system's prefers-color-scheme and watches
 * for changes via a MediaQueryList listener.
 */
export function setMode(
  mode: "light" | "dark" | "auto",
  target: HTMLElement = document.documentElement,
): (() => void) | void {
  if (mode === "light") {
    target.removeAttribute("data-theme");
    return;
  }

  if (mode === "dark") {
    target.setAttribute("data-theme", "dark");
    return;
  }

  // "auto" — follow system preference
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent | MediaQueryList) => {
    if ("matches" in e && e.matches) {
      target.setAttribute("data-theme", "dark");
    } else {
      target.removeAttribute("data-theme");
    }
  };

  handler(mql);
  mql.addEventListener("change", handler as EventListener);

  return () => mql.removeEventListener("change", handler as EventListener);
}

/**
 * Apply a named brand theme using the data-theme attribute.
 * The theme must have been compiled into global.css via
 * tokens/themes/<name>.json at build time.
 */
export function setBrand(
  brandName: string,
  target: HTMLElement = document.documentElement,
): void {
  target.setAttribute("data-theme", brandName);
}

/**
 * Compose two theme objects. The overlay wins on conflict.
 */
export function mergeThemes(
  base: ThemeTokens,
  overlay: ThemeTokens,
): ThemeTokens {
  const result: ThemeTokens = { ...base };
  for (const [key, val] of Object.entries(overlay)) {
    if (
      typeof val === "object" && val !== null &&
      typeof result[key] === "object" && result[key] !== null
    ) {
      result[key] = mergeThemes(
        result[key] as ThemeTokens,
        val as ThemeTokens,
      );
    } else {
      result[key] = val;
    }
  }
  return result;
}
