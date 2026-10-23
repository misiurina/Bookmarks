export function faviconFor(pageUrl) {
  if (!pageUrl || !/^https?:/i.test(pageUrl)) return "";
  if (!globalThis.chrome?.runtime?.getURL) return "";
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "32");
  return url.href;
}
