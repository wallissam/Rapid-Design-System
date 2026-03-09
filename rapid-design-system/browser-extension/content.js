/**
 * Rapid Design System — Browser Extension Content Script (v2)
 *
 * Runs on every page. Detects --rapid-* CSS custom properties.
 * If found, enables a floating inspector panel for live editing.
 * Overrides persist per-domain via chrome.storage.local.
 */

(function () {
  const PREFIX = "--rapid-";
  const PANEL_ID = "rds-inspector-panel";
  const STORAGE_KEY_PREFIX = "rds-overrides:";
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;

  // ── Detection ────────────────────────────────────────────────────

  function detectRapidTokens() {
    const styles = getComputedStyle(document.documentElement);
    const seen = new Set();
    const tokens = [];

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          const matches = rule.cssText.match(/--rapid-[a-z0-9-]+/g);
          if (!matches) continue;
          for (const m of matches) {
            if (seen.has(m)) continue;
            seen.add(m);
            const val = styles.getPropertyValue(m).trim();
            if (val) tokens.push({ name: m, value: val });
          }
        }
      } catch (e) { /* cross-origin */ }
    }
    return tokens;
  }

  function categorize(tokens) {
    const order = ["brand","surface","text","border","focus","status","spacing","font","radius","border-width","shadow","opacity","z","duration","easing"];
    const groups = {};
    for (const t of tokens) {
      const key = t.name.replace(PREFIX, "");
      const parts = key.split("-");
      let cat;
      if (parts[0] === "color" && parts.length > 2) cat = parts[1];
      else if (parts[0] === "color") cat = "color";
      else if (parts[0] === "font") cat = "font";
      else if (parts[0] === "border") cat = "border-width";
      else cat = parts[0];

      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
      if (!groups[label]) groups[label] = [];
      groups[label].push(t);
    }
    const sorted = {};
    for (const key of Object.keys(groups).sort((a, b) => {
      const ai = order.indexOf(a.toLowerCase());
      const bi = order.indexOf(b.toLowerCase());
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })) {
      sorted[key] = groups[key];
    }
    return sorted;
  }

  function isColor(value) {
    return HEX_RE.test(value) || value.startsWith("rgb") || value.startsWith("hsl");
  }

  function shortName(n) {
    return n.replace(PREFIX, "").replace(/^color-/, "");
  }

  function toHex6(value) {
    if (HEX_RE.test(value)) return value;
    const m = value.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
      const h = (v) => parseInt(v).toString(16).padStart(2, "0");
      return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
    }
    return "#000000";
  }

  // ── Storage ──────────────────────────────────────────────────────

  function storageKey() { return STORAGE_KEY_PREFIX + location.hostname; }

  function loadOverrides(cb) {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(storageKey(), (r) => cb(r[storageKey()] || {}));
    } else {
      try { cb(JSON.parse(localStorage.getItem(storageKey()) || "{}")); }
      catch { cb({}); }
    }
  }

  function saveOverrides(o) {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [storageKey()]: o });
    } else {
      localStorage.setItem(storageKey(), JSON.stringify(o));
    }
  }

  function applyOverrides(o) {
    for (const [p, v] of Object.entries(o)) document.documentElement.style.setProperty(p, v);
  }

  function clearAllOverrides(o) {
    for (const p of Object.keys(o)) document.documentElement.style.removeProperty(p);
  }

  // ── CSS (scoped via data attribute to avoid page interference) ───

  function injectStyles() {
    if (document.getElementById("rds-ext-styles")) return;
    const style = document.createElement("style");
    style.id = "rds-ext-styles";
    style.textContent = `
      #${PANEL_ID} { --p-bg:#ffffff; --p-bg2:#f7f7f8; --p-fg:#1a1a1a; --p-fg2:#6b6b6b; --p-border:#e0e0e0; --p-accent:#0f6cbd; --p-hover:#f0f0f2; --p-badge:#ef4444; }
      #${PANEL_ID}.rds-dark { --p-bg:#1e1e1e; --p-bg2:#2a2a2a; --p-fg:#e0e0e0; --p-fg2:#999; --p-border:#3a3a3a; --p-accent:#479ef5; --p-hover:#2e2e2e; }

      #${PANEL_ID} { position:fixed;top:12px;right:12px;z-index:2147483647;width:340px;max-height:calc(100vh - 24px);background:var(--p-bg);color:var(--p-fg);border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.06);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;line-height:1.4;display:flex;flex-direction:column;overflow:hidden; }
      #${PANEL_ID}.rds-minimized { width:auto;max-height:none; }
      #${PANEL_ID}.rds-minimized .rds-body, #${PANEL_ID}.rds-minimized .rds-search, #${PANEL_ID}.rds-minimized .rds-footer { display:none; }

      #${PANEL_ID} .rds-header { padding:10px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--p-border);cursor:move;user-select:none; }
      #${PANEL_ID} .rds-logo { width:22px;height:22px;border-radius:5px;background:var(--p-accent);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:10px;flex-shrink:0; }
      #${PANEL_ID} .rds-header-info { margin-left:8px;flex:1; }
      #${PANEL_ID} .rds-header-title { font-weight:600;font-size:12px; }
      #${PANEL_ID} .rds-header-sub { font-size:10px;color:var(--p-fg2); }
      #${PANEL_ID} .rds-badge { display:inline-block;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:700;background:var(--p-badge);color:#fff;margin-left:6px; }
      #${PANEL_ID} .rds-hbtn { width:22px;height:22px;border-radius:4px;border:none;background:var(--p-bg2);color:var(--p-fg2);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:4px; }
      #${PANEL_ID} .rds-hbtn:hover { background:var(--p-hover); }

      #${PANEL_ID} .rds-search { padding:6px 12px;border-bottom:1px solid var(--p-border); }
      #${PANEL_ID} .rds-search input { width:100%;padding:5px 8px;border:1px solid var(--p-border);border-radius:5px;font-size:11px;font-family:inherit;background:var(--p-bg2);color:var(--p-fg);outline:none; }
      #${PANEL_ID} .rds-search input:focus { border-color:var(--p-accent); }

      #${PANEL_ID} .rds-body { overflow-y:auto;flex:1;padding:4px 0; }

      #${PANEL_ID} .rds-group-header { display:flex;align-items:center;padding:5px 14px;cursor:pointer;user-select:none; }
      #${PANEL_ID} .rds-group-header:hover { background:var(--p-hover); }
      #${PANEL_ID} .rds-chevron { width:12px;font-size:9px;color:var(--p-fg2);flex-shrink:0;transition:transform .15s; }
      #${PANEL_ID} .rds-chevron.open { transform:rotate(90deg); }
      #${PANEL_ID} .rds-group-label { flex:1;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--p-fg2);margin-left:4px; }
      #${PANEL_ID} .rds-group-count { font-size:9px;color:var(--p-fg2);background:var(--p-bg2);padding:1px 6px;border-radius:8px; }
      #${PANEL_ID} .rds-group-items { overflow:hidden; }
      #${PANEL_ID} .rds-group-items.collapsed { display:none; }

      #${PANEL_ID} .rds-row { display:flex;align-items:center;gap:6px;padding:3px 14px 3px 30px; }
      #${PANEL_ID} .rds-row:hover { background:var(--p-hover); }
      #${PANEL_ID} .rds-swatch { width:18px;height:18px;border-radius:4px;flex-shrink:0;border:1px solid var(--p-border); }
      #${PANEL_ID} .rds-label { flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;font-size:11px; }
      #${PANEL_ID} .rds-label:hover { color:var(--p-accent); }
      #${PANEL_ID} .rds-label.has-override { font-weight:600; }
      #${PANEL_ID} .rds-hex { width:62px;padding:2px 5px;font-size:10px;font-family:'SF Mono',Consolas,monospace;border:1px solid var(--p-border);border-radius:3px;background:var(--p-bg2);color:var(--p-fg);text-align:center;flex-shrink:0; }
      #${PANEL_ID} .rds-hex:focus { outline:none;border-color:var(--p-accent); }
      #${PANEL_ID} .rds-picker { width:24px;height:20px;border:1px solid var(--p-border);border-radius:3px;padding:0;cursor:pointer;background:none;flex-shrink:0;-webkit-appearance:none;appearance:none; }
      #${PANEL_ID} .rds-picker::-webkit-color-swatch-wrapper { padding:0; }
      #${PANEL_ID} .rds-picker::-webkit-color-swatch { border:none;border-radius:2px; }
      #${PANEL_ID} .rds-val { width:62px;padding:2px 5px;font-size:10px;font-family:'SF Mono',Consolas,monospace;border:1px solid var(--p-border);border-radius:3px;background:var(--p-bg2);color:var(--p-fg);flex-shrink:0; }
      #${PANEL_ID} .rds-val:focus { outline:none;border-color:var(--p-accent); }
      #${PANEL_ID} .rds-reset-token { width:16px;height:16px;border:none;background:none;color:var(--p-fg2);cursor:pointer;font-size:11px;flex-shrink:0;border-radius:3px;display:none;align-items:center;justify-content:center; }
      #${PANEL_ID} .rds-reset-token:hover { background:var(--p-hover);color:var(--p-badge); }
      #${PANEL_ID} .rds-row.overridden .rds-reset-token { display:flex; }
      #${PANEL_ID} .rds-override-dot { width:5px;height:5px;border-radius:50%;background:var(--p-accent);flex-shrink:0;display:none; }
      #${PANEL_ID} .rds-row.overridden .rds-override-dot { display:block; }

      #${PANEL_ID} .rds-footer { padding:8px 14px;border-top:1px solid var(--p-border);display:flex;gap:6px;align-items:center; }
      #${PANEL_ID} .rds-fbtn { padding:4px 10px;font-size:10px;font-weight:600;border-radius:4px;border:1px solid var(--p-border);background:var(--p-bg2);color:var(--p-fg);cursor:pointer;white-space:nowrap; }
      #${PANEL_ID} .rds-fbtn:hover { background:var(--p-hover); }
      #${PANEL_ID} .rds-fbtn.primary { background:var(--p-accent);color:#fff;border-color:var(--p-accent); }
      #${PANEL_ID} .rds-spacer { flex:1; }
      #${PANEL_ID} .rds-toast { position:absolute;bottom:48px;left:50%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:var(--p-fg);color:var(--p-bg);font-size:11px;font-weight:500;opacity:0;transition:opacity .2s;pointer-events:none; }
      #${PANEL_ID} .rds-toast.show { opacity:1; }
    `;
    document.head.appendChild(style);
  }

  // ── Panel ────────────────────────────────────────────────────────

  function createPanel(tokens) {
    if (document.getElementById(PANEL_ID)) return;
    injectStyles();

    const groups = categorize(tokens);
    let currentOverrides = {};
    let collapsed = {};

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    updatePanelTheme(panel);

    // Toast
    const toast = document.createElement("div");
    toast.className = "rds-toast";
    panel.appendChild(toast);

    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 1400);
    }

    // ── Header ──
    const header = document.createElement("div");
    header.className = "rds-header";

    const logo = document.createElement("div");
    logo.className = "rds-logo";
    logo.textContent = "R";

    const info = document.createElement("div");
    info.className = "rds-header-info";
    const title = document.createElement("div");
    title.className = "rds-header-title";
    title.textContent = "RDS Inspector";
    const sub = document.createElement("div");
    sub.className = "rds-header-sub";

    const overrideBadge = document.createElement("span");
    overrideBadge.className = "rds-badge";
    overrideBadge.style.display = "none";

    function updateHeaderInfo() {
      const n = Object.keys(currentOverrides).length;
      sub.textContent = `${tokens.length} tokens`;
      if (n > 0) {
        overrideBadge.textContent = `${n} override${n > 1 ? "s" : ""}`;
        overrideBadge.style.display = "inline-block";
      } else {
        overrideBadge.style.display = "none";
      }
    }

    info.appendChild(title);
    info.appendChild(sub);
    title.appendChild(overrideBadge);

    const minBtn = document.createElement("button");
    minBtn.className = "rds-hbtn";
    minBtn.textContent = "—";
    minBtn.title = "Minimize";
    minBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.classList.toggle("rds-minimized");
      minBtn.textContent = panel.classList.contains("rds-minimized") ? "+" : "—";
    });

    const closeBtn = document.createElement("button");
    closeBtn.className = "rds-hbtn";
    closeBtn.textContent = "×";
    closeBtn.title = "Close";
    closeBtn.addEventListener("click", (e) => { e.stopPropagation(); panel.remove(); });

    header.appendChild(logo);
    header.appendChild(info);
    header.appendChild(minBtn);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // ── Search ──
    const searchWrap = document.createElement("div");
    searchWrap.className = "rds-search";
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Filter tokens...";
    searchWrap.appendChild(searchInput);
    panel.appendChild(searchWrap);

    // ── Body ──
    const body = document.createElement("div");
    body.className = "rds-body";

    function renderGroups(filter) {
      body.textContent = "";
      for (const [groupName, groupTokens] of Object.entries(groups)) {
        const filtered = filter
          ? groupTokens.filter((t) => t.name.toLowerCase().includes(filter) || shortName(t.name).includes(filter))
          : groupTokens;
        if (filtered.length === 0) continue;

        const isCollapsed = collapsed[groupName] === true;

        // Group header
        const gh = document.createElement("div");
        gh.className = "rds-group-header";

        const chevron = document.createElement("span");
        chevron.className = isCollapsed ? "rds-chevron" : "rds-chevron open";
        chevron.textContent = "▶";

        const glabel = document.createElement("span");
        glabel.className = "rds-group-label";
        glabel.textContent = groupName;

        const gcount = document.createElement("span");
        gcount.className = "rds-group-count";
        gcount.textContent = String(filtered.length);

        gh.appendChild(chevron);
        gh.appendChild(glabel);
        gh.appendChild(gcount);

        const items = document.createElement("div");
        items.className = isCollapsed ? "rds-group-items collapsed" : "rds-group-items";

        gh.addEventListener("click", () => {
          collapsed[groupName] = !collapsed[groupName];
          items.classList.toggle("collapsed");
          chevron.classList.toggle("open");
        });

        for (const token of filtered) {
          const isCol = isColor(token.value);
          const isOverridden = token.name in currentOverrides;
          const currentVal = currentOverrides[token.name] || token.value;

          const row = document.createElement("div");
          row.className = isOverridden ? "rds-row overridden" : "rds-row";

          const dot = document.createElement("div");
          dot.className = "rds-override-dot";
          row.appendChild(dot);

          if (isCol) {
            const swatch = document.createElement("div");
            swatch.className = "rds-swatch";
            swatch.style.background = currentVal;
            swatch.dataset.token = token.name;
            row.appendChild(swatch);
          }

          const label = document.createElement("span");
          label.className = isOverridden ? "rds-label has-override" : "rds-label";
          label.textContent = shortName(token.name);
          label.title = `Click to copy: ${token.name}`;
          label.addEventListener("click", () => {
            navigator.clipboard.writeText(`var(${token.name})`).then(() => showToast("Copied!"));
          });
          row.appendChild(label);

          if (isCol) {
            const hex = document.createElement("input");
            hex.className = "rds-hex";
            hex.type = "text";
            hex.value = toHex6(currentVal);
            hex.spellcheck = false;

            const picker = document.createElement("input");
            picker.className = "rds-picker";
            picker.type = "color";
            picker.value = toHex6(currentVal);

            const syncColor = (v) => {
              document.documentElement.style.setProperty(token.name, v);
              currentOverrides[token.name] = v;
              saveOverrides(currentOverrides);
              const sw = row.querySelector(".rds-swatch");
              if (sw) sw.style.background = v;
              row.classList.add("overridden");
              label.classList.add("has-override");
              updateHeaderInfo();
            };

            picker.addEventListener("input", (e) => {
              hex.value = e.target.value;
              syncColor(e.target.value);
            });
            hex.addEventListener("change", (e) => {
              const v = e.target.value.trim();
              if (HEX_RE.test(v)) {
                picker.value = v;
                syncColor(v);
              }
            });

            row.appendChild(hex);
            row.appendChild(picker);
          } else {
            const input = document.createElement("input");
            input.className = "rds-val";
            input.type = "text";
            input.value = currentVal;
            input.addEventListener("change", (e) => {
              const v = e.target.value.trim();
              document.documentElement.style.setProperty(token.name, v);
              currentOverrides[token.name] = v;
              saveOverrides(currentOverrides);
              row.classList.add("overridden");
              label.classList.add("has-override");
              updateHeaderInfo();
            });
            row.appendChild(input);
          }

          const resetToken = document.createElement("button");
          resetToken.className = "rds-reset-token";
          resetToken.textContent = "↺";
          resetToken.title = "Reset to default";
          resetToken.addEventListener("click", () => {
            document.documentElement.style.removeProperty(token.name);
            delete currentOverrides[token.name];
            saveOverrides(currentOverrides);
            row.classList.remove("overridden");
            label.classList.remove("has-override");
            const resolved = getComputedStyle(document.documentElement).getPropertyValue(token.name).trim();
            if (isCol) {
              const h = toHex6(resolved);
              row.querySelector(".rds-picker").value = h;
              row.querySelector(".rds-hex").value = h;
              const sw = row.querySelector(".rds-swatch");
              if (sw) sw.style.background = resolved;
            } else {
              row.querySelector(".rds-val").value = resolved;
            }
            updateHeaderInfo();
          });
          row.appendChild(resetToken);

          items.appendChild(row);
        }

        body.appendChild(gh);
        body.appendChild(items);
      }
    }

    panel.appendChild(body);

    // ── Footer ──
    const footer = document.createElement("div");
    footer.className = "rds-footer";

    const darkBtn = document.createElement("button");
    darkBtn.className = "rds-fbtn";
    function updateDarkBtn() {
      const d = document.documentElement.getAttribute("data-theme") === "dark";
      darkBtn.textContent = d ? "☀ Light" : "☾ Dark";
    }
    updateDarkBtn();
    darkBtn.addEventListener("click", () => {
      const html = document.documentElement;
      if (html.getAttribute("data-theme") === "dark") html.removeAttribute("data-theme");
      else html.setAttribute("data-theme", "dark");
      updateDarkBtn();
      updatePanelTheme(panel);
    });

    const resetAllBtn = document.createElement("button");
    resetAllBtn.className = "rds-fbtn";
    resetAllBtn.textContent = "Reset All";
    resetAllBtn.addEventListener("click", () => {
      clearAllOverrides(currentOverrides);
      currentOverrides = {};
      saveOverrides(currentOverrides);
      updateHeaderInfo();
      renderGroups(searchInput.value.trim().toLowerCase());
      showToast("All overrides cleared");
    });

    const importBtn = document.createElement("button");
    importBtn.className = "rds-fbtn";
    importBtn.textContent = "Import";
    importBtn.addEventListener("click", () => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json";
      fileInput.addEventListener("change", () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result);
            for (const [k, v] of Object.entries(data)) {
              if (k.startsWith(PREFIX)) {
                document.documentElement.style.setProperty(k, v);
                currentOverrides[k] = v;
              }
            }
            saveOverrides(currentOverrides);
            updateHeaderInfo();
            renderGroups(searchInput.value.trim().toLowerCase());
            showToast(`Imported ${Object.keys(data).length} tokens`);
          } catch { showToast("Invalid JSON"); }
        };
        reader.readAsText(file);
      });
      fileInput.click();
    });

    const spacer = document.createElement("div");
    spacer.className = "rds-spacer";

    const exportBtn = document.createElement("button");
    exportBtn.className = "rds-fbtn primary";
    exportBtn.textContent = "Export";
    exportBtn.addEventListener("click", () => {
      const all = {};
      const styles = getComputedStyle(document.documentElement);
      for (const t of tokens) {
        all[t.name] = currentOverrides[t.name] || styles.getPropertyValue(t.name).trim();
      }
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rds-${location.hostname}-palette.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    const shareBtn = document.createElement("button");
    shareBtn.className = "rds-fbtn";
    shareBtn.textContent = "Share";
    shareBtn.title = "Copy a URL with your overrides encoded";
    shareBtn.addEventListener("click", () => {
      if (Object.keys(currentOverrides).length === 0) {
        showToast("No overrides to share");
        return;
      }
      const compact = {};
      for (const [k, v] of Object.entries(currentOverrides)) {
        compact[k.replace(PREFIX, "")] = v;
      }
      const encoded = btoa(JSON.stringify(compact));
      const url = new URL(location.href);
      url.searchParams.set("rds", encoded);
      navigator.clipboard.writeText(url.toString()).then(() => showToast("Share URL copied!"));
    });

    footer.appendChild(darkBtn);
    footer.appendChild(resetAllBtn);
    footer.appendChild(importBtn);
    footer.appendChild(spacer);
    footer.appendChild(shareBtn);
    footer.appendChild(exportBtn);
    panel.appendChild(footer);

    // ── Events ──
    searchInput.addEventListener("input", () => renderGroups(searchInput.value.trim().toLowerCase()));

    // ── Dragging ──
    let dx = 0, dy = 0, sx = 0, sy = 0;
    header.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      dx = e.clientX; dy = e.clientY;
      sx = panel.offsetLeft; sy = panel.offsetTop;
      const move = (ev) => {
        panel.style.right = "auto";
        panel.style.left = (sx + ev.clientX - dx) + "px";
        panel.style.top = (sy + ev.clientY - dy) + "px";
      };
      const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });

    document.body.appendChild(panel);

    // ── Load overrides + render ──
    loadOverrides((saved) => {
      currentOverrides = saved;
      applyOverrides(saved);
      updateHeaderInfo();
      renderGroups("");
    });

    // ── Check for shared overrides in URL ──
    try {
      const rdsParam = new URL(location.href).searchParams.get("rds");
      if (rdsParam) {
        const decoded = JSON.parse(atob(rdsParam));
        for (const [k, v] of Object.entries(decoded)) {
          const full = PREFIX + k;
          document.documentElement.style.setProperty(full, v);
          currentOverrides[full] = v;
        }
        saveOverrides(currentOverrides);
        updateHeaderInfo();
        renderGroups("");
        showToast("Applied shared palette");
      }
    } catch { /* no shared overrides */ }
  }

  function updatePanelTheme(panel) {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) panel.classList.add("rds-dark");
    else panel.classList.remove("rds-dark");
  }

  // ── Message handler ──────────────────────────────────────────────

  if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "toggle-panel") {
        const existing = document.getElementById(PANEL_ID);
        if (existing) existing.remove();
        else {
          const t = detectRapidTokens();
          if (t.length > 0) createPanel(t);
        }
      }
      if (msg.type === "detect") {
        const t = detectRapidTokens();
        chrome.runtime.sendMessage({ type: "detect-result", count: t.length });
      }
    });
  }

  // ── Auto-apply on load ───────────────────────────────────────────

  const tokens = detectRapidTokens();
  if (tokens.length > 0) {
    loadOverrides((saved) => {
      if (Object.keys(saved).length > 0) applyOverrides(saved);
    });

    // Check for shared overrides in URL
    try {
      const rdsParam = new URL(location.href).searchParams.get("rds");
      if (rdsParam) {
        const decoded = JSON.parse(atob(rdsParam));
        for (const [k, v] of Object.entries(decoded)) {
          document.documentElement.style.setProperty(PREFIX + k, v);
        }
      }
    } catch { /* ignore */ }

    if (typeof chrome !== "undefined" && chrome.runtime) {
      try { chrome.runtime.sendMessage({ type: "detect-result", count: tokens.length }); }
      catch { /* popup not open */ }
    }
  }
})();
