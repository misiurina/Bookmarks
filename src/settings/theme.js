const api = globalThis.__bookmarksSettings;

export const SETTINGS_EVENT = api.EVENT;
export const SCHEMES = api.SCHEMES;
export const CHROME = api.CHROME;
export const CLASSICAL = api.CLASSICAL;
export const DEFAULT_SETTINGS = api.DEFAULT_SETTINGS;
export const readSettings = api.readSettings;
export const writeSettings = api.writeSettings;
export const applySettings = api.applySettings;
export const resolvePalette = api.resolvePalette;
export const resolvedMode = api.resolvedMode;
export const themeGlow = api.themeGlow;
export const normalizeHex = api.normalizeHex;

export function notifySettings() {
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: { local: true } }));
}

export function watchSettings(listener) {
  const handler = (event) => listener(readSettings(), event.detail?.local === true);
  window.addEventListener(SETTINGS_EVENT, handler);
  return () => window.removeEventListener(SETTINGS_EVENT, handler);
}
