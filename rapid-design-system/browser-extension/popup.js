const statusEl = document.getElementById("status");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const toggleBtn = document.getElementById("toggleBtn");
const resetBtn = document.getElementById("resetBtn");

let detected = false;

function updateUI(count) {
  detected = count > 0;
  if (detected) {
    statusEl.className = "status detected";
    statusDot.className = "dot green";
    statusText.textContent = `${count} RDS token${count === 1 ? "" : "s"} detected`;
    toggleBtn.disabled = false;
    resetBtn.disabled = false;
  } else {
    statusEl.className = "status not-detected";
    statusDot.className = "dot grey";
    statusText.textContent = "No RDS tokens found on this page";
    toggleBtn.disabled = true;
    resetBtn.disabled = true;
  }
}

// Ask the content script to detect tokens
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return;

  chrome.tabs.sendMessage(tabs[0].id, { type: "detect" }, () => {
    if (chrome.runtime.lastError) {
      updateUI(0);
    }
  });
});

// Listen for detection result
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "detect-result") {
    updateUI(msg.count);
  }
});

// Toggle panel
toggleBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: "toggle-panel" });
    window.close();
  });
});

// Reset overrides
resetBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const hostname = new URL(tabs[0].url).hostname;
    const key = "rds-overrides:" + hostname;
    chrome.storage.local.remove(key, () => {
      chrome.tabs.reload(tabs[0].id);
      window.close();
    });
  });
});

// Auto-detect after a short delay (content script might need time)
setTimeout(() => {
  if (!detected) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.scripting?.executeScript?.({
        target: { tabId: tabs[0].id },
        func: () => {
          const styles = getComputedStyle(document.documentElement);
          let count = 0;
          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules) {
                if (rule.cssText.includes("--rapid-")) count++;
              }
            } catch (e) {}
          }
          return count;
        },
      }).then((results) => {
        if (results?.[0]?.result > 0) {
          updateUI(results[0].result);
        } else {
          updateUI(0);
        }
      }).catch(() => updateUI(0));
    });
  }
}, 300);
