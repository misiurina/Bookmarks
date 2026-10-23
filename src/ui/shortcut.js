export function isMac() {
  return /Mac|iPhone|iPad/.test(navigator.platform) || /Macintosh/.test(navigator.userAgent);
}

export function isShortcut(event, key) {
  if (event.repeat || event.isComposing || event.altKey || event.shiftKey) return false;
  if (event.key.toLowerCase() !== key) return false;
  return isMac() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

export function shortcutLabel(key) {
  return isMac() ? `⌘${key}` : `Ctrl+${key}`;
}
