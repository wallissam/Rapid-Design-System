/**
 * Rapid Design System — Figma Plugin (Sandbox Code)
 *
 * Runs in Figma's main thread with access to the document API.
 * Communicates with ui.html via postMessage.
 *
 * Three capabilities:
 *   1. Import: JSON → Figma Variables (create/update collection with light+dark modes)
 *   2. Export: Figma Variables → RDS-format JSON
 *   3. Lint:  Scan selected nodes for off-system colours
 */

const COLLECTION_NAME = "Rapid Design System";
const LIGHT_MODE_NAME = "Light";
const DARK_MODE_NAME = "Dark";

figma.showUI(__html__, { width: 420, height: 560, themeColors: true });

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

figma.ui.onmessage = async (msg) => {
  try {
    switch (msg.type) {
      case "import-tokens":
        await importTokens(msg.lightTokens, msg.darkTokens);
        break;
      case "export-tokens":
        await exportTokens();
        break;
      case "lint-selection":
        await lintSelection(msg.knownColors);
        break;
      default:
        send("error", { message: `Unknown message type: ${msg.type}` });
    }
  } catch (err) {
    send("error", { message: err.message || String(err) });
  }
};

function send(type, payload) {
  figma.ui.postMessage({ type, ...payload });
}

// ---------------------------------------------------------------------------
// 1. Import: JSON → Figma Variables
// ---------------------------------------------------------------------------

function flattenTokens(obj, prefix) {
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key === "_comment") continue;
    const path = prefix ? `${prefix}/${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      entries.push(...flattenTokens(value, path));
    } else {
      entries.push({ path, value: String(value) });
    }
  }
  return entries;
}

function hexToFigmaRGBA(hex) {
  if (!hex || !hex.startsWith("#") || hex.length !== 7) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
    a: 1,
  };
}

function isColorValue(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function isNumericValue(value) {
  return /^[\d.]+(?:px|rem|em|%)?$/.test(value);
}

function parseNumeric(value) {
  return parseFloat(value) || 0;
}

function resolveTokenType(value) {
  if (isColorValue(value)) return "COLOR";
  if (isNumericValue(value)) return "FLOAT";
  return "STRING";
}

async function importTokens(lightJSON, darkJSON) {
  const light = JSON.parse(lightJSON);
  const dark = darkJSON ? JSON.parse(darkJSON) : {};

  const lightEntries = flattenTokens(light, "");
  const darkEntries = flattenTokens(dark, "");
  const darkMap = new Map(darkEntries.map((e) => [e.path, e.value]));

  // Find or create the collection
  const collections = figma.variables.getLocalVariableCollections();
  let collection = collections.find((c) => c.name === COLLECTION_NAME);

  if (!collection) {
    collection = figma.variables.createVariableCollection(COLLECTION_NAME);
    collection.renameMode(collection.modes[0].modeId, LIGHT_MODE_NAME);
  }

  const lightModeId = collection.modes[0].modeId;
  let darkModeId = collection.modes.find((m) => m.name === DARK_MODE_NAME)?.modeId;

  if (!darkModeId && darkEntries.length > 0) {
    darkModeId = collection.addMode(DARK_MODE_NAME);
  }

  // Build a map of existing variables by name
  const existingVars = new Map();
  for (const v of figma.variables.getLocalVariables()) {
    if (v.variableCollectionId === collection.id) {
      existingVars.set(v.name, v);
    }
  }

  let created = 0;
  let updated = 0;

  for (const entry of lightEntries) {
    const resolvedType = resolveTokenType(entry.value);
    let variable = existingVars.get(entry.path);

    if (!variable) {
      variable = figma.variables.createVariable(entry.path, collection, resolvedType);
      created++;
    } else {
      updated++;
    }

    // Set light value
    if (resolvedType === "COLOR") {
      const rgba = hexToFigmaRGBA(entry.value);
      if (rgba) variable.setValueForMode(lightModeId, rgba);
    } else if (resolvedType === "FLOAT") {
      variable.setValueForMode(lightModeId, parseNumeric(entry.value));
    } else {
      variable.setValueForMode(lightModeId, entry.value);
    }

    // Set dark value (if exists)
    if (darkModeId && darkMap.has(entry.path)) {
      const darkValue = darkMap.get(entry.path);
      if (resolvedType === "COLOR") {
        const rgba = hexToFigmaRGBA(darkValue);
        if (rgba) variable.setValueForMode(darkModeId, rgba);
      } else if (resolvedType === "FLOAT") {
        variable.setValueForMode(darkModeId, parseNumeric(darkValue));
      } else {
        variable.setValueForMode(darkModeId, darkValue);
      }
    }
  }

  send("import-complete", {
    created,
    updated,
    total: lightEntries.length,
    collectionName: COLLECTION_NAME,
  });
}

// ---------------------------------------------------------------------------
// 2. Export: Figma Variables → RDS JSON
// ---------------------------------------------------------------------------

function figmaRGBAToHex({ r, g, b }) {
  const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function setNestedValue(obj, slashPath, value) {
  const parts = slashPath.split("/");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in cursor)) cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

async function exportTokens() {
  const collections = figma.variables.getLocalVariableCollections();
  const variables = figma.variables.getLocalVariables();

  if (collections.length === 0) {
    send("export-complete", { light: "{}", dark: "{}", count: 0 });
    return;
  }

  // Use the first collection, or one named "Rapid Design System"
  const collection =
    collections.find((c) => c.name === COLLECTION_NAME) || collections[0];

  const lightModeId = collection.modes[0]?.modeId;
  const darkMode = collection.modes.find(
    (m) => m.name.toLowerCase().includes("dark")
  );
  const darkModeId = darkMode?.modeId;

  const collectionVars = variables.filter(
    (v) => v.variableCollectionId === collection.id
  );

  const lightObj = {};
  const darkObj = {};

  for (const v of collectionVars) {
    const lightVal = v.valuesByMode[lightModeId];
    const darkVal = darkModeId ? v.valuesByMode[darkModeId] : undefined;

    let lightFormatted = formatFigmaValue(lightVal, v.resolvedType);
    let darkFormatted = darkVal !== undefined
      ? formatFigmaValue(darkVal, v.resolvedType)
      : undefined;

    if (lightFormatted !== null) {
      setNestedValue(lightObj, v.name, lightFormatted);
    }

    if (darkFormatted !== null && darkFormatted !== undefined && darkFormatted !== lightFormatted) {
      setNestedValue(darkObj, v.name, darkFormatted);
    }
  }

  send("export-complete", {
    light: JSON.stringify(lightObj, null, 2),
    dark: JSON.stringify(darkObj, null, 2),
    count: collectionVars.length,
    collectionName: collection.name,
  });
}

function formatFigmaValue(val, type) {
  if (val === undefined || val === null) return null;
  if (typeof val === "object" && "type" in val && val.type === "VARIABLE_ALIAS") {
    return null; // skip aliases for now
  }
  if (type === "COLOR" && typeof val === "object" && "r" in val) {
    return figmaRGBAToHex(val);
  }
  if (type === "FLOAT") {
    return String(val);
  }
  if (type === "STRING") {
    return String(val);
  }
  return String(val);
}

// ---------------------------------------------------------------------------
// 3. Lint: Scan selection for off-system colours
// ---------------------------------------------------------------------------

async function lintSelection(knownColorsJSON) {
  const knownColors = new Set(JSON.parse(knownColorsJSON));
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    send("lint-complete", { results: [], message: "No nodes selected." });
    return;
  }

  const results = [];
  let nodesScanned = 0;

  function lintNode(node) {
    nodesScanned++;
    // Check fills
    if ("fills" in node && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.type === "SOLID" && fill.visible !== false) {
          const hex = figmaRGBAToHex(fill.color);
          if (!knownColors.has(hex.toLowerCase())) {
            results.push({
              nodeId: node.id,
              nodeName: node.name,
              property: "fill",
              value: hex,
              type: "off-system",
            });
          }
        }
      }
    }

    // Check strokes
    if ("strokes" in node && Array.isArray(node.strokes)) {
      for (const stroke of node.strokes) {
        if (stroke.type === "SOLID" && stroke.visible !== false) {
          const hex = figmaRGBAToHex(stroke.color);
          if (!knownColors.has(hex.toLowerCase())) {
            results.push({
              nodeId: node.id,
              nodeName: node.name,
              property: "stroke",
              value: hex,
              type: "off-system",
            });
          }
        }
      }
    }

    // Recurse into children
    if ("children" in node) {
      for (const child of node.children) {
        lintNode(child);
      }
    }
  }

  for (const node of selection) {
    lintNode(node);
  }

  const unique = new Map();
  for (const r of results) {
    const key = `${r.nodeName}::${r.property}::${r.value}`;
    if (!unique.has(key)) unique.set(key, r);
  }

  send("lint-complete", {
    results: Array.from(unique.values()),
    total: unique.size,
    nodesScanned,
  });
}
