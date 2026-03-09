const statusEl = document.getElementById("status");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const toggleBtn = document.getElementById("toggleBtn");
const darkBtn = document.getElementById("darkBtn");
const resetBtn = document.getElementById("resetBtn");
const overrideInfo = document.getElementById("overrideInfo");

let tokenCount = 0;

function updateUI(count) {
  tokenCount = count;
  if (count > 0) {
    statusEl.className = "status detected";
    statusDot.className = "dot green";
    statusText.textContent = `${count} RDS token${count === 1 ? "" : "s"} detected`;
    toggleBtn.disabled = false;
    darkBtn.disabled = false;
    checkOverrides();
  } else {
    statusEl.className = "status not-detected";
    statusDot.className = "dot grey";
    statusText.textContent = "No RDS tokens found on this page";
    toggleBtn.disabled = true;
    darkBtn.disabled = true;
    resetBtn.style.display = "none";
  }
}

function checkOverrides() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const hostname = new URL(tabs[0].url).hostname;
    const key = "rds-overrides:" + hostname;
    chrome.storage.local.get(key, (result) => {
      const overrides = result[key] || {};
      const n = Object.keys(overrides).length;
      if (n > 0) {
        overrideInfo.textContent = `${n} token override${n > 1 ? "s" : ""} active on this domain`;
        overrideInfo.style.display = "block";
        resetBtn.style.display = "block";
      } else {
        overrideInfo.style.display = "none";
        resetBtn.style.display = "none";
      }
    });
  });
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return;
  chrome.tabs.sendMessage(tabs[0].id, { type: "detect" }, () => {
    if (chrome.runtime.lastError) updateUI(0);
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "detect-result") updateUI(msg.count);
});

toggleBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: "toggle-panel" });
    window.close();
  });
});

darkBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        const html = document.documentElement;
        if (html.getAttribute("data-theme") === "dark") html.removeAttribute("data-theme");
        else html.setAttribute("data-theme", "dark");
      },
    });
  });
});

resetBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const hostname = new URL(tabs[0].url).hostname;
    chrome.storage.local.remove("rds-overrides:" + hostname, () => {
      chrome.tabs.reload(tabs[0].id);
      window.close();
    });
  });
});

setTimeout(() => {
  if (tokenCount === 0) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.scripting?.executeScript?.({
        target: { tabId: tabs[0].id },
        func: () => {
          let count = 0;
          for (const sheet of document.styleSheets) {
            try { for (const r of sheet.cssRules) { if (r.cssText.includes("--rapid-")) count++; } }
            catch {}
          }
          return count;
        },
      }).then((r) => updateUI(r?.[0]?.result > 0 ? r[0].result : 0))
        .catch(() => updateUI(0));
    });
  }
}, 300);
