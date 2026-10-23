// Chrome always loads this file for a new tab. Stay out of the way until the
// settings button opts in. The sidebar and the open-in-tab button set surface.
(function () {
  const DEFAULT_HOME = "chrome://new-tab-page";

  function restoreChromeNewTab(url) {
    document.documentElement.hidden = true;
    const showAgain = () => {
      document.documentElement.hidden = false;
    };
    if (!globalThis.chrome?.runtime?.sendMessage) {
      showAgain();
      return;
    }
    chrome.runtime.sendMessage({ type: "restore-new-tab", url: url || DEFAULT_HOME }).then((response) => {
      if (!response?.ok) showAgain();
    }).catch(showAgain);
  }

  async function currentHomepage() {
    const settings = globalThis.chrome?.browserSettings;
    for (const setting of [settings?.homepageOverride, settings?.newTabPageOverride]) {
      if (!setting?.get) continue;
      try {
        const result = await setting.get({});
        if (typeof result?.value === "string" && result.value) return result.value;
      } catch {
        // Chrome does not expose this setting. Fall through.
      }
    }
    return DEFAULT_HOME;
  }

  globalThis.__restoreChromeNewTab = restoreChromeNewTab;
  globalThis.__currentHomepage = currentHomepage;

  if (location.protocol !== "chrome-extension:") return;
  if (new URLSearchParams(location.search).get("surface")) return;
  let useAsHome = false;
  let previousHome = "";
  try {
    const raw = JSON.parse(localStorage.getItem("bookmarks.settings.v1") || "null");
    useAsHome = raw?.useAsHome === true;
    previousHome = typeof raw?.previousHome === "string" ? raw.previousHome : "";
  } catch {
    useAsHome = false;
  }
  if (!useAsHome) restoreChromeNewTab(previousHome);
})();
