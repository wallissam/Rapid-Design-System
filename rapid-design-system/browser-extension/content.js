/**
 * Rapid Design System — Browser Extension Content Script
 *
 * Runs on every page. Detects --rapid-* CSS custom properties.
 * If found, enables a floating palette panel for live editing.
 * Overrides persist per-domain via chrome.storage.local.
 */

(function () {
  const PREFIX = "--rapid-";
  const PANEL_ID = "rds-inspector-panel";
  const STORAGE_KEY_PREFIX = "rds-overrides:";
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;

  // ── Detection ────────────────────────────────────────────────────
  function detectRapidTokens() {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const tokens = [];

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          const text = rule.cssText;
          const matches = text.match(/--rapid-[a-z0-9-]+/g);
          if (matches) {
            for (const m of matches) {
              const val = styles.getPropertyValue(m).trim();
              if (val) tokens.push({ name: m, value: val });
            }
          }
        }
      } catch (e) {
        // cross-origin stylesheet — skip
      }
    }

    // Deduplicate
    const seen = new Set();
    return tokens.filter((t) => {
      if (seen.has(t.name)) return false;
      seen.add(t.name);
      return true;
    });
  }

  function categorize(tokens) {
    const groups = {};
    for (const t of tokens) {
      const key = t.name.replace(PREFIX, "");
      const parts = key.split("-");
      let category;

      if (parts[0] === "color") {
        category = parts.length > 2 ? `Color / ${parts[1]}` : "Color";
      } else if (parts[0] === "spacing") category = "Spacing";
      else if (parts[0] === "font") category = "Typography";
      else if (parts[0] === "radius") category = "Radius";
      else if (parts[0] === "shadow") category = "Shadow";
      else if (parts[0] === "opacity") category = "Opacity";
      else if (parts[0] === "z") category = "Z-Index";
      else if (parts[0] === "duration") category = "Duration";
      else if (parts[0] === "easing") category = "Easing";
      else if (parts[0] === "border") category = "Border";
      else if (parts[0] === "focus") category = "Focus";
      else category = "Other";

      if (!groups[category]) groups[category] = [];
      groups[category].push(t);
    }
    return groups;
  }

  function isColor(value) {
    return HEX_RE.test(value) || value.startsWith("rgb") || value.startsWith("hsl");
  }

  function shortName(fullName) {
    return fullName.replace(PREFIX, "").replace(/^color-/, "");
  }

  // ── Storage ──────────────────────────────────────────────────────
  function storageKey() {
    return STORAGE_KEY_PREFIX + location.hostname;
  }

  function loadOverrides(callback) {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(storageKey(), (result) => {
        callback(result[storageKey()] || {});
      });
    } else {
      try {
        callback(JSON.parse(localStorage.getItem(storageKey()) || "{}"));
      } catch { callback({}); }
    }
  }

  function saveOverrides(overrides) {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [storageKey()]: overrides });
    } else {
      localStorage.setItem(storageKey(), JSON.stringify(overrides));
    }
  }

  function applyOverrides(overrides) {
    for (const [prop, val] of Object.entries(overrides)) {
      document.documentElement.style.setProperty(prop, val);
    }
  }

  function clearOverrides(overrides) {
    for (const prop of Object.keys(overrides)) {
      document.documentElement.style.removeProperty(prop);
    }
  }

  // ── Panel UI ─────────────────────────────────────────────────────
  function createPanel(tokens) {
    if (document.getElementById(PANEL_ID)) return;

    const groups = categorize(tokens);
    let currentOverrides = {};

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.setAttribute("style", `
      position: fixed; top: 12px; right: 12px; z-index: 2147483647;
      width: 320px; max-height: calc(100vh - 24px);
      background: #fff; color: #222;
      border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.18);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px; line-height: 1.4;
      display: flex; flex-direction: column;
      overflow: hidden; transition: opacity .2s;
    `);

    // Header
    const header = document.createElement("div");
    header.setAttribute("style", `
      padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;
      border-bottom: 1px solid #e5e5e5; cursor: move; user-select: none;
    `);
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:24px;height:24px;border-radius:6px;background:#0f6cbd;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:11px;">R</div>
        <div>
          <div style="font-weight:600;font-size:13px;">RDS Inspector</div>
          <div style="color:#888;font-size:10px;">${tokens.length} tokens detected</div>
        </div>
      </div>
    `;

    const btnRow = document.createElement("div");
    btnRow.setAttribute("style", "display:flex;gap:6px;");

    const resetBtn = document.createElement("button");
    resetBtn.textContent = "Reset";
    resetBtn.setAttribute("style", `
      padding:4px 10px;font-size:10px;font-weight:600;border-radius:4px;
      border:1px solid #ddd;background:#f5f5f5;color:#333;cursor:pointer;
    `);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.setAttribute("style", `
      width:24px;height:24px;border-radius:4px;border:none;
      background:#f5f5f5;color:#666;cursor:pointer;font-size:16px;
      display:flex;align-items:center;justify-content:center;
    `);

    btnRow.appendChild(resetBtn);
    btnRow.appendChild(closeBtn);
    header.appendChild(btnRow);
    panel.appendChild(header);

    // Search
    const searchWrap = document.createElement("div");
    searchWrap.setAttribute("style", "padding:8px 12px;border-bottom:1px solid #eee;");
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search tokens...";
    searchInput.setAttribute("style", `
      width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;
      font-size:12px;font-family:inherit;background:#fafafa;color:#222;
      outline:none;
    `);
    searchWrap.appendChild(searchInput);
    panel.appendChild(searchWrap);

    // Body
    const body = document.createElement("div");
    body.setAttribute("style", "overflow-y:auto;flex:1;padding:8px 0;");

    function renderGroups(filter) {
      body.textContent = "";
      for (const [groupName, groupTokens] of Object.entries(groups)) {
        const filtered = filter
          ? groupTokens.filter((t) => t.name.includes(filter) || shortName(t.name).includes(filter))
          : groupTokens;
        if (filtered.length === 0) continue;

        const section = document.createElement("div");
        section.setAttribute("style", "margin-bottom:4px;");

        const title = document.createElement("div");
        title.textContent = groupName;
        title.setAttribute("style", `
          padding:4px 16px;font-size:10px;font-weight:600;text-transform:uppercase;
          letter-spacing:.06em;color:#999;
        `);
        section.appendChild(title);

        for (const token of filtered) {
          const isCol = isColor(token.value);
          const row = document.createElement("div");
          row.setAttribute("style", `
            display:flex;align-items:center;gap:8px;padding:4px 16px;
            cursor:default;transition:background .1s;
          `);
          row.addEventListener("mouseenter", () => { row.style.background = "#f5f5f5"; });
          row.addEventListener("mouseleave", () => { row.style.background = ""; });

          if (isCol) {
            const swatch = document.createElement("div");
            swatch.setAttribute("style", `
              width:20px;height:20px;border-radius:4px;flex-shrink:0;
              border:1px solid rgba(0,0,0,.1);
              background:${currentOverrides[token.name] || token.value};
            `);
            swatch.dataset.token = token.name;
            row.appendChild(swatch);
          }

          const label = document.createElement("span");
          label.textContent = shortName(token.name);
          label.setAttribute("style", "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;");
          row.appendChild(label);

          if (isCol) {
            const picker = document.createElement("input");
            picker.type = "color";
            picker.value = toHex6(currentOverrides[token.name] || token.value);
            picker.setAttribute("style", `
              width:28px;height:22px;border:1px solid #ddd;border-radius:3px;
              padding:0;cursor:pointer;background:none;flex-shrink:0;
            `);
            picker.addEventListener("input", (e) => {
              const v = e.target.value;
              document.documentElement.style.setProperty(token.name, v);
              currentOverrides[token.name] = v;
              saveOverrides(currentOverrides);
              const sw = row.querySelector("[data-token]");
              if (sw) sw.style.background = v;
            });
            row.appendChild(picker);
          } else {
            const input = document.createElement("input");
            input.type = "text";
            input.value = currentOverrides[token.name] || token.value;
            input.setAttribute("style", `
              width:70px;padding:2px 6px;font-size:11px;
              font-family:'SF Mono',Consolas,monospace;
              border:1px solid #ddd;border-radius:3px;background:#fafafa;color:#222;
              flex-shrink:0;
            `);
            input.addEventListener("change", (e) => {
              const v = e.target.value;
              document.documentElement.style.setProperty(token.name, v);
              currentOverrides[token.name] = v;
              saveOverrides(currentOverrides);
            });
            row.appendChild(input);
          }

          section.appendChild(row);
        }
        body.appendChild(section);
      }
    }

    panel.appendChild(body);

    // Footer
    const footer = document.createElement("div");
    footer.setAttribute("style", `
      padding:8px 16px;border-top:1px solid #eee;display:flex;
      justify-content:space-between;align-items:center;
    `);

    const darkToggle = document.createElement("button");
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    darkToggle.textContent = isDark ? "☀ Light" : "☾ Dark";
    darkToggle.setAttribute("style", `
      padding:4px 12px;font-size:11px;font-weight:600;border-radius:4px;
      border:1px solid #ddd;background:#f5f5f5;color:#333;cursor:pointer;
    `);
    darkToggle.addEventListener("click", () => {
      const html = document.documentElement;
      if (html.getAttribute("data-theme") === "dark") {
        html.removeAttribute("data-theme");
        darkToggle.textContent = "☾ Dark";
      } else {
        html.setAttribute("data-theme", "dark");
        darkToggle.textContent = "☀ Light";
      }
    });

    const exportBtn = document.createElement("button");
    exportBtn.textContent = "Export";
    exportBtn.setAttribute("style", `
      padding:4px 12px;font-size:11px;font-weight:600;border-radius:4px;
      border:none;background:#0f6cbd;color:#fff;cursor:pointer;
    `);
    exportBtn.addEventListener("click", () => {
      const all = {};
      const styles = getComputedStyle(document.documentElement);
      for (const t of tokens) {
        all[t.name] = currentOverrides[t.name] || styles.getPropertyValue(t.name).trim();
      }
      const json = JSON.stringify(all, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rds-palette-export.json";
      a.click();
      URL.revokeObjectURL(url);
    });

    footer.appendChild(darkToggle);
    footer.appendChild(exportBtn);
    panel.appendChild(footer);

    // Events
    searchInput.addEventListener("input", () => renderGroups(searchInput.value.trim().toLowerCase()));

    resetBtn.addEventListener("click", () => {
      clearOverrides(currentOverrides);
      currentOverrides = {};
      saveOverrides(currentOverrides);
      renderGroups(searchInput.value.trim().toLowerCase());
    });

    closeBtn.addEventListener("click", () => panel.remove());

    // Dragging
    let dragX = 0, dragY = 0, startX = 0, startY = 0;
    header.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      dragX = e.clientX;
      dragY = e.clientY;
      startX = panel.offsetLeft;
      startY = panel.offsetTop;
      const onMove = (ev) => {
        panel.style.right = "auto";
        panel.style.left = (startX + ev.clientX - dragX) + "px";
        panel.style.top = (startY + ev.clientY - dragY) + "px";
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    document.body.appendChild(panel);

    // Load saved overrides and render
    loadOverrides((saved) => {
      currentOverrides = saved;
      applyOverrides(saved);
      renderGroups("");
    });
  }

  function toHex6(value) {
    if (HEX_RE.test(value)) return value;
    const m = value.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
    if (m) {
      const h = (n) => parseInt(n).toString(16).padStart(2, "0");
      return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
    }
    return "#000000";
  }

  // ── Message from popup ───────────────────────────────────────────
  if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "toggle-panel") {
        const existing = document.getElementById(PANEL_ID);
        if (existing) {
          existing.remove();
        } else {
          const tokens = detectRapidTokens();
          if (tokens.length > 0) createPanel(tokens);
        }
      }
      if (msg.type === "detect") {
        const tokens = detectRapidTokens();
        chrome.runtime.sendMessage({ type: "detect-result", count: tokens.length });
      }
    });
  }

  // ── Auto-apply saved overrides on page load ──────────────────────
  const tokens = detectRapidTokens();
  if (tokens.length > 0) {
    loadOverrides((saved) => {
      if (Object.keys(saved).length > 0) {
        applyOverrides(saved);
      }
    });

    // Notify popup of detection
    if (typeof chrome !== "undefined" && chrome.runtime) {
      try {
        chrome.runtime.sendMessage({ type: "detect-result", count: tokens.length });
      } catch (e) { /* popup not open */ }
    }
  }
})();
