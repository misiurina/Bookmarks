importScripts("action-icon.js");

// Clicking the toolbar icon toggles this extension's side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
  console.error(error);
});

const actionIcon = globalThis.__bookmarksActionIcon;

function paintStoredIcon(fill) {
  actionIcon.paint(fill || actionIcon.DEFAULT_FILL).catch(() => {});
}

chrome.storage.local.get(actionIcon.STORAGE_KEY, (stored) => {
  paintStoredIcon(stored?.[actionIcon.STORAGE_KEY]);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[actionIcon.STORAGE_KEY]) return;
  paintStoredIcon(changes[actionIcon.STORAGE_KEY].newValue);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "restore-new-tab") return;
  const tabId = sender.tab?.id;
  if (tabId == null) {
    sendResponse({ ok: false });
    return;
  }
  restoreNewTab(tabId, message.url).then((ok) => sendResponse({ ok })).catch(() => sendResponse({ ok: false }));
  return true;
});

async function restoreNewTab(tabId, url) {
  const fallback = ["chrome://new-tab-page", "chrome-search://local-ntp/local-ntp.html"];
  const targets = typeof url === "string" && /^https?:\/\//.test(url) ? [url] : fallback;
  for (const target of targets) {
    try {
      await chrome.tabs.update(tabId, { url: target });
      return true;
    } catch {
      // This page cannot be opened from an extension. Try the next one.
    }
  }
  return false;
}
