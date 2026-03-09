// @ts-check

/**
 * Rapid Design System — VS Code Extension
 *
 * Provides:
 *   1. Autocomplete for var(--rapid-*) and .rapid-* utility classes
 *   2. Hover info showing light/dark values and JSON path
 *   3. Diagnostics flagging hardcoded hex colours that match a token
 *   4. Quick-fix to replace hardcoded values with var(--rapid-*)
 */

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const PREFIX = "rapid";
const VAR_PATTERN = /var\(--rapid-([a-z0-9-]*)/;
const HEX_PATTERN = /#[0-9a-fA-F]{6}\b/g;
const CLASS_PATTERN = /class\s*=\s*["'][^"']*rapid-([a-z0-9-]*)/;

let tokenCache = null;
let diagnosticCollection = null;

// ---------------------------------------------------------------------------
// Token loading
// ---------------------------------------------------------------------------

function loadTokens() {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!ws) return null;

  const config = vscode.workspace.getConfiguration("rapidDesignSystem");
  const basePath = path.join(ws, config.get("tokenPath") || "tokens/base.json");
  const darkPath = path.join(ws, config.get("darkTokenPath") || "tokens/dark.json");

  // Also check if tokens are in a rapid-design-system subdirectory
  const altBasePath = path.join(ws, "rapid-design-system", config.get("tokenPath") || "tokens/base.json");

  let resolvedBase = basePath;
  if (!fs.existsSync(basePath) && fs.existsSync(altBasePath)) {
    resolvedBase = altBasePath;
  }
  if (!fs.existsSync(resolvedBase)) return null;

  const resolvedDark = resolvedBase.replace("base.json", "dark.json");

  try {
    const base = JSON.parse(fs.readFileSync(resolvedBase, "utf-8"));
    let dark = {};
    if (fs.existsSync(resolvedDark)) {
      dark = JSON.parse(fs.readFileSync(resolvedDark, "utf-8"));
    }
    return buildTokenIndex(base, dark);
  } catch {
    return null;
  }
}

function flattenJSON(obj, prefix = "") {
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key === "_comment") continue;
    const fullKey = prefix ? `${prefix}-${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      entries.push(...flattenJSON(value, fullKey));
    } else {
      entries.push([fullKey, String(value)]);
    }
  }
  return entries;
}

function buildTokenIndex(base, dark) {
  const baseEntries = flattenJSON(base);
  const darkEntries = flattenJSON(dark);
  const darkMap = new Map(darkEntries);

  const tokens = [];
  const valueToToken = new Map();

  for (const [key, value] of baseEntries) {
    const cssVar = `--${PREFIX}-${key}`;
    const darkValue = darkMap.get(key) || null;
    const dotPath = key.replace(/-/g, ".");

    const token = { key, cssVar, dotPath, value, darkValue };
    tokens.push(token);

    // Map hex values to their token for quick-fix suggestions
    if (value.startsWith("#") && value.length === 7) {
      const lower = value.toLowerCase();
      if (!valueToToken.has(lower)) valueToToken.set(lower, []);
      valueToToken.get(lower).push(token);
    }
  }

  return { tokens, valueToToken };
}

function getTokens() {
  if (!tokenCache) tokenCache = loadTokens();
  return tokenCache;
}

// ---------------------------------------------------------------------------
// 1. Autocomplete Provider
// ---------------------------------------------------------------------------

const completionProvider = {
  provideCompletionItems(document, position) {
    const data = getTokens();
    if (!data) return [];

    const lineText = document.lineAt(position).text;
    const textBefore = lineText.substring(0, position.character);

    // var(--rapid- completion
    if (textBefore.includes("var(--rapid-") || textBefore.includes("var(--rapid")) {
      return data.tokens.map((t) => {
        const item = new vscode.CompletionItem(
          t.cssVar,
          vscode.CompletionItemKind.Variable,
        );
        item.detail = t.value;
        item.documentation = new vscode.MarkdownString(
          `**${t.dotPath}**\n\nLight: \`${t.value}\`${t.darkValue ? `\nDark: \`${t.darkValue}\`` : ""}`,
        );
        item.insertText = t.cssVar;

        if (t.value.startsWith("#")) {
          item.kind = vscode.CompletionItemKind.Color;
        }
        return item;
      });
    }

    // .rapid-* class completion
    if (textBefore.match(/class\s*=\s*["'][^"']*rapid-$/) || textBefore.match(/className\s*=\s*["'][^"']*rapid-$/)) {
      const classes = generateClassNames(data.tokens);
      return classes.map((c) => {
        const item = new vscode.CompletionItem(
          c.name,
          vscode.CompletionItemKind.Value,
        );
        item.detail = c.property;
        item.documentation = new vscode.MarkdownString(
          `\`${c.css}\``,
        );
        item.insertText = c.name;
        return item;
      });
    }

    return [];
  },
};

function generateClassNames(tokens) {
  const classes = [];
  for (const t of tokens) {
    if (t.key.startsWith("color-")) {
      const slug = t.key.replace(/^color-/, "");
      const textSlug = slug.startsWith("text-") ? slug.replace(/^text-/, "") : slug;
      classes.push({ name: `rapid-bg-${slug}`, property: `background-color`, css: `background-color: var(${t.cssVar})` });
      classes.push({ name: `rapid-text-${textSlug}`, property: `color`, css: `color: var(${t.cssVar})` });
      classes.push({ name: `rapid-border-${slug}`, property: `border-color`, css: `border-color: var(${t.cssVar})` });
    } else if (t.key.startsWith("spacing-")) {
      const slug = t.key.replace(/^spacing-/, "");
      classes.push({ name: `rapid-p-${slug}`, property: `padding`, css: `padding: var(${t.cssVar})` });
      classes.push({ name: `rapid-m-${slug}`, property: `margin`, css: `margin: var(${t.cssVar})` });
    } else if (t.key.startsWith("radius-")) {
      const slug = t.key.replace(/^radius-/, "");
      classes.push({ name: `rapid-rounded-${slug}`, property: `border-radius`, css: `border-radius: var(${t.cssVar})` });
    } else if (t.key.startsWith("shadow-")) {
      const slug = t.key.replace(/^shadow-/, "");
      classes.push({ name: `rapid-shadow-${slug}`, property: `box-shadow`, css: `box-shadow: var(${t.cssVar})` });
    }
  }
  return classes;
}

// ---------------------------------------------------------------------------
// 2. Hover Provider
// ---------------------------------------------------------------------------

const hoverProvider = {
  provideHover(document, position) {
    const data = getTokens();
    if (!data) return null;

    const range = document.getWordRangeAtPosition(position, /--rapid-[a-z0-9-]+/);
    if (!range) return null;

    const word = document.getText(range);
    const token = data.tokens.find((t) => t.cssVar === word);
    if (!token) return null;

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**Rapid Token:** \`${token.dotPath}\`\n\n`);
    md.appendMarkdown(`| Mode | Value |\n|---|---|\n`);
    md.appendMarkdown(`| Light | \`${token.value}\` |\n`);
    if (token.darkValue) {
      md.appendMarkdown(`| Dark | \`${token.darkValue}\` |\n`);
    }
    md.appendMarkdown(`\n\`\`\`css\nvar(${token.cssVar})\n\`\`\``);

    return new vscode.Hover(md, range);
  },
};

// ---------------------------------------------------------------------------
// 3. Diagnostics (hardcoded hex values)
// ---------------------------------------------------------------------------

function updateDiagnostics(document) {
  if (!diagnosticCollection) return;

  const config = vscode.workspace.getConfiguration("rapidDesignSystem");
  if (!config.get("diagnostics.enabled")) {
    diagnosticCollection.delete(document.uri);
    return;
  }

  const data = getTokens();
  if (!data) return;

  // Skip generated files
  const text = document.getText();
  if (text.includes("AUTO-GENERATED") || text.includes("DO NOT EDIT")) {
    diagnosticCollection.delete(document.uri);
    return;
  }

  const diagnostics = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    HEX_PATTERN.lastIndex = 0;

    while ((match = HEX_PATTERN.exec(line)) !== null) {
      const hex = match[0].toLowerCase();
      const suggestions = data.valueToToken.get(hex);
      if (!suggestions || suggestions.length === 0) continue;

      // Skip if it's already inside a var() or a comment
      const before = line.substring(0, match.index);
      if (before.includes("var(") || before.trimStart().startsWith("//") || before.trimStart().startsWith("*")) continue;

      const range = new vscode.Range(i, match.index, i, match.index + match[0].length);
      const tokenNames = suggestions.map((s) => s.cssVar).join(", ");
      const diag = new vscode.Diagnostic(
        range,
        `Hardcoded colour ${match[0]} — use var(${suggestions[0].cssVar}) instead`,
        vscode.DiagnosticSeverity.Information,
      );
      diag.code = "rapid-hardcoded-color";
      diag.source = "Rapid Design System";
      diagnostics.push(diag);
    }
  }

  diagnosticCollection.set(document.uri, diagnostics);
}

// ---------------------------------------------------------------------------
// 4. Quick Fix (replace hardcoded with var())
// ---------------------------------------------------------------------------

const codeActionProvider = {
  provideCodeActions(document, range, context) {
    const data = getTokens();
    if (!data) return [];

    const actions = [];

    for (const diag of context.diagnostics) {
      if (diag.code !== "rapid-hardcoded-color") continue;

      const hex = document.getText(diag.range).toLowerCase();
      const suggestions = data.valueToToken.get(hex);
      if (!suggestions) continue;

      for (const token of suggestions) {
        const fix = new vscode.CodeAction(
          `Replace with var(${token.cssVar})`,
          vscode.CodeActionKind.QuickFix,
        );
        fix.edit = new vscode.WorkspaceEdit();
        fix.edit.replace(document.uri, diag.range, `var(${token.cssVar})`);
        fix.diagnostics = [diag];
        fix.isPreferred = true;
        actions.push(fix);
      }
    }

    return actions;
  },
};

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

function activate(context) {
  diagnosticCollection = vscode.languages.createDiagnosticCollection("rapid-design-system");
  context.subscriptions.push(diagnosticCollection);

  const languages = [
    "css", "scss", "less", "html",
    "javascript", "javascriptreact",
    "typescript", "typescriptreact",
    "vue", "svelte",
  ];

  const completionSelector = languages.map((l) => ({ language: l, scheme: "file" }));

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      completionSelector,
      completionProvider,
      "-",
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(completionSelector, hoverProvider),
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      completionSelector,
      codeActionProvider,
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
  );

  // Run diagnostics on active editors
  if (vscode.window.activeTextEditor) {
    updateDiagnostics(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) updateDiagnostics(editor.document);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      updateDiagnostics(event.document);
    }),
  );

  // Reload tokens when base.json changes
  const watcher = vscode.workspace.createFileSystemWatcher("**/tokens/base.json");
  watcher.onDidChange(() => { tokenCache = null; });
  watcher.onDidCreate(() => { tokenCache = null; });
  context.subscriptions.push(watcher);
}

function deactivate() {}

module.exports = { activate, deactivate };
