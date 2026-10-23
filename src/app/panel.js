// The side panel is the same page as the new tab. Following a bookmark link
// there would replace the panel, so open it in the browser window instead.
export function openSidePanelLinks() {
  if (document.documentElement.dataset.sidePanel !== "on") return;
  document.querySelector("#panel-expand")?.addEventListener("click", () => {
    openExtensionTab().catch((error) => console.error(error));
  });
  document.addEventListener("click", (event) => {
    if (event.button !== 0) return;
    openFromPanel(event);
  });
  document.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    openFromPanel(event);
  });
}

function openFromPanel(event) {
  if (event.defaultPrevented || event.altKey) return;
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!anchor) return;
  const url = bookmarkUrl(anchor);
  if (!url) return;
  if (!globalThis.chrome?.tabs) return;
  event.preventDefault();
  const background = event.button === 1 || event.metaKey || event.ctrlKey;
  const newWindow = event.shiftKey && !background;
  openBookmark(url, { background, newWindow }).catch((error) => console.error(error));
}

function bookmarkUrl(anchor) {
  let url;
  try {
    url = new URL(anchor.href);
  } catch {
    return "";
  }
  if (url.protocol === "javascript:" || url.protocol === "chrome-extension:") return "";
  return url.href;
}

async function openExtensionTab() {
  const url = chrome.runtime.getURL("src/newtab/index.html?surface=tab");
  const opened = chrome.tabs.create({ url, active: true });
  try {
    if (chrome.sidePanel?.close) await chrome.sidePanel.close();
    else window.close();
  } catch {
    window.close();
  }
  await opened;
}

export async function readActivePage() {
  const tabs = globalThis.chrome?.tabs;
  if (!tabs?.query) return null;
  try {
    let [tab] = await tabs.query({ active: true, currentWindow: true });
    if (!tab?.url && !tab?.pendingUrl) [tab] = await tabs.query({ active: true, lastFocusedWindow: true });
    return bookmarkablePage(tab);
  } catch {
    return null;
  }
}

function bookmarkablePage(tab) {
  const raw = tab?.url || tab?.pendingUrl || "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) return null;
  const title = String(tab?.title ?? "").trim() || url.hostname.replace(/^www\./, "");
  return { title, url: url.href };
}

async function openBookmark(url, { background, newWindow }) {
  if (newWindow) {
    await chrome.windows.create({ url, focused: true });
    return;
  }
  if (background) {
    await chrome.tabs.create({ url, active: false });
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) {
    await chrome.tabs.create({ url });
    return;
  }
  try {
    await chrome.tabs.update(tab.id, { url });
  } catch {
    await chrome.tabs.create({ url });
  }
}
