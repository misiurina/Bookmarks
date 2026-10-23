import { listFolders } from "../bookmarks/model.js";
import { loadBookmarkTree, watchBookmarks } from "../bookmarks/service.js";
import { chevronDownIcon, closeIcon, eyeIcon, eyeOffIcon, schemeCheckIcon } from "../ui/icons.js";
import { isShortcut, shortcutLabel } from "../ui/shortcut.js";
import {
  DEFAULT_SETTINGS,
  SCHEMES,
  CHROME,
  CLASSICAL,
  applySettings,
  normalizeHex,
  notifySettings,
  readSettings,
  themeGlow,
  resolvedMode,
  watchSettings,
  writeSettings,
} from "./theme.js";

const FLAGS = ["showCounts", "showAddresses", "showFavicons", "indentFavicons", "colorOpenFolders", "showGraph", "recenterGraph", "showExpandButton", "showHideButton", "showAddRow", "showBookmarkPage", "sectionsEnabled", "revealSections", "doubleClickBranch", "doubleClickRename", "showFavourites"];
let bookmarkFolders = [];
let schemesExpanded = false;

export function mountSettings() {
  const toggle = document.querySelector("#settings-toggle");
  const drawer = document.querySelector("#settings-drawer");
  const form = document.querySelector("#settings-form");
  const closeButton = document.querySelector("#settings-close");
  const resetButton = document.querySelector("#reset-theme");
  const schemeList = document.querySelector("#scheme-list");
  if (!toggle || !drawer || !form || !closeButton || !schemeList) return;

  const homeButton = document.querySelector("#home-toggle");
  let alreadyHome = false;
  const paintHome = () => syncHome(homeButton, readSettings(), alreadyHome);
  renderSchemes(schemeList);
  paintShortcuts(form);
  syncForm(form, readSettings());
  void refreshBookmarkFolders();
  watchBookmarks(() => {
    void refreshBookmarkFolders();
  });
  paintHome();
  renderHiddenFolders(readSettings());
  watchSettings((_settings, local) => {
    const settings = readSettings();
    renderHiddenFolders(settings);
    paintHome();
    if (!local) syncForm(form, settings);
  });
  homeButton?.addEventListener("click", async () => {
    const settings = readSettings();
    if (settings.useAsHome === true) {
      const restore = settings.previousHome;
      settings.useAsHome = false;
      settings.previousHome = "";
      writeSettings(settings);
      notifySettings();
      paintHome();
      if (!new URLSearchParams(location.search).get("surface")) globalThis.__restoreChromeNewTab?.(restore);
      return;
    }
    const current = await globalThis.__currentHomepage?.();
    if (isOwnPage(current)) {
      alreadyHome = true;
      paintHome();
      return;
    }
    settings.previousHome = typeof current === "string" ? current : "";
    settings.useAsHome = true;
    writeSettings(settings);
    notifySettings();
    paintHome();
  });
  globalThis.__currentHomepage?.().then((url) => {
    if (!isOwnPage(url)) return;
    alreadyHome = true;
    paintHome();
  });
  schemeList.addEventListener("click", (event) => {
    const expand = event.target.closest("[data-schemes-expand]");
    if (expand) {
      event.preventDefault();
      schemesExpanded = true;
      syncForm(form, readSettings());
      return;
    }
    const remove = event.target.closest("[data-own-delete]");
    if (!remove) return;
    event.preventDefault();
    event.stopPropagation();
    const settings = readSettings();
    const id = remove.dataset.ownDelete;
    settings.ownThemes = settings.ownThemes.filter((theme) => theme.id !== id);
    if (settings.glow) delete settings.glow[`own:${id}`];
    if (settings.scheme === `own:${id}`) settings.scheme = DEFAULT_SETTINGS.scheme;
    commit(settings);
    syncForm(form, settings);
  });
  form.querySelector("#hidden-list")?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    const row = button?.closest("[data-id]");
    if (!button || !row) return;
    const sectionId = row.dataset.section || "default";
    if (button.dataset.action === "forget") forgetFolder(sectionId, row.dataset.id);
    else toggleFolder(sectionId, row.dataset.id);
  });

  let lastFocus = null;
  let closeTimer = 0;

  toggle.addEventListener("click", () => {
    if (drawer.classList.contains("is-open")) close();
    else open();
  });
  closeButton.addEventListener("click", close);
  resetButton?.addEventListener("click", () => {
    schemesExpanded = false;
    const settings = readSettings();
    settings.appearance = DEFAULT_SETTINGS.appearance;
    settings.scheme = DEFAULT_SETTINGS.scheme;
    settings.themeTab = DEFAULT_SETTINGS.themeTab;
    settings.custom = structuredClone(DEFAULT_SETTINGS.custom);
    commit(settings);
    syncForm(form, settings);
  });

  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("change", (event) => {
    if (form.dataset.syncing === "true") return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const settings = readSettings();
    if (target.name === "showGlow") {
      settings.glow = settings.glow ?? {};
      settings.glow[settings.scheme] = target.checked;
    } else if (FLAGS.includes(target.name)) settings[target.name] = target.checked;
    else if (target.name === "appearance") settings.appearance = target.value;
    else if (target.name === "themeTab") {
      if (settings.themeTab === "own" && target.value !== "own") rememberOwnTheme(settings);
      schemesExpanded = false;
      settings.themeTab = target.value;
    }
    else if (target.name === "guides") settings.guides = target.value;
    else if (target.name === "scheme") {
      settings.scheme = target.value;
      const saved = findOwnTheme(settings);
      if (saved) {
        settings.custom = clonePalette(saved);
        settings.themeTab = "own";
      } else settings.themeTab = CHROME[target.value] ? "chrome" : "classical";
    }
    else if (target.name === "bookmarkFolderId") {
      if (target.value === "last") settings.bookmarkUseLastFolder = true;
      else if (bookmarkFolders.some((folder) => folder.id === target.value)) {
        settings.bookmarkUseLastFolder = false;
        settings.bookmarkFolderId = target.value;
      } else return;
    }
    else if (target.name === "remember") settings.remember = target.value;
    else if (target.name === "rememberMinutes") {
      const minutes = clampMinutes(target.value);
      if (minutes == null) return;
      settings.rememberMinutes = minutes;
    } else if (target.type === "color") {
      if (!adoptOwn(settings, target.name, target.value)) return;
    } else return;
    commit(settings);
    if (target.name === "remember" || target.name === "rememberMinutes" || target.name === "showAddRow" || target.name === "showHideButton" || target.name === "sectionsEnabled" || target.name === "revealSections" || target.name === "showFavourites" || target.name === "showGraph" || target.name === "recenterGraph" || target.name === "bookmarkFolderId") notifySettings();
    syncForm(form, settings);
  });

  form.addEventListener("input", (event) => {
    if (form.dataset.syncing === "true") return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type === "color") {
      const settings = readSettings();
      if (!adoptOwn(settings, target.name, target.value)) return;
      commit(settings);
      const hex = form.elements[`${target.name}Hex`];
      if (hex) hex.value = target.value.toLowerCase();
      syncForm(form, settings);
      return;
    }
    if (!target.name.endsWith("Hex")) return;
    const hex = normalizeHex(target.value);
    if (!hex) return;
    const key = target.name.slice(0, -3);
    const settings = readSettings();
    if (!adoptOwn(settings, key, hex)) return;
    commit(settings);
    if (form.elements[key]) form.elements[key].value = hex;
    syncForm(form, settings);
  });

  watchSettings((settings) => syncForm(form, settings));

  function open() {
    lastFocus = document.activeElement;
    window.clearTimeout(closeTimer);
    drawer.hidden = false;
    document.documentElement.dataset.settings = "open";
    toggle.setAttribute("aria-expanded", "true");
    drawer.setAttribute("aria-hidden", "false");
    syncForm(form, readSettings());
    requestAnimationFrame(() => {
      drawer.classList.add("is-open");
      closeButton.focus();
    });
    document.addEventListener("keydown", onKeydown);
  }

  function close() {
    schemesExpanded = false;
    const settings = readSettings();
    if (rememberOwnTheme(settings)) commit(settings);
    drawer.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    drawer.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", onKeydown);
    const finish = () => {
      if (drawer.classList.contains("is-open")) return;
      drawer.hidden = true;
      delete document.documentElement.dataset.settings;
    };
    drawer.addEventListener("transitionend", finish, { once: true });
    closeTimer = window.setTimeout(finish, 240);
    const returnFocus = lastFocus instanceof HTMLElement ? lastFocus : toggle;
    returnFocus.focus();
  }

  function onKeydown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
  }

  document.addEventListener("keydown", (event) => {
    if (!isShortcut(event, "d")) return;
    event.preventDefault();
    if (drawer.classList.contains("is-open")) close();
    else open();
  });
  document.addEventListener("pointerdown", () => {
    drawer.dataset.input = "pointer";
  });
  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key !== "Tab" && !event.key.startsWith("Arrow")) return;
    drawer.dataset.input = "key";
  });
}

function paintShortcuts(form) {
  for (const key of form.querySelectorAll(".hotkeys kbd[data-key]")) {
    key.textContent = shortcutLabel(key.dataset.key);
  }
}

function selectionNeedsExpand(tab, ownThemes, scheme) {
  const ids = tab === "own"
    ? ownThemes.map((theme) => `own:${theme.id}`)
    : Object.keys(tab === "classical" ? CLASSICAL : tab === "chrome" ? CHROME : {});
  return ids.indexOf(scheme) >= 8;
}

function renderSchemes(list, tab = "chrome", options = {}) {
  if (!list) return;
  const { expanded = false, ownThemes = [] } = options;
  const entries = tab === "own"
    ? ownThemes.map((theme) => [theme, theme])
    : Object.entries(tab === "classical" ? CLASSICAL : tab === "chrome" ? CHROME : {});
  const overflow = entries.length > 8 && !expanded;
  const visible = overflow ? entries.slice(0, 7) : entries;
  const fragment = document.createDocumentFragment();
  for (const [id, scheme] of visible) fragment.append(tab === "own" ? savedChoice(scheme) : schemeChoice(id, scheme.name));
  if (overflow) fragment.append(expandChoice());
  list.replaceChildren(fragment);
}

function expandChoice() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "schemes-more";
  button.dataset.schemesExpand = "true";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "Show all colors");
  button.append(chevronDownIcon());
  return button;
}

function savedChoice(theme) {
  const tile = document.createElement("div");
  tile.className = "scheme scheme-saved";
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "scheme";
  input.value = `own:${theme.id}`;
  input.setAttribute("aria-label", "Saved theme");
  label.append(input, themeSwatch(`own:${theme.id}`), schemeCheckIcon());
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "scheme-delete";
  remove.dataset.ownDelete = theme.id;
  remove.setAttribute("aria-label", "Delete theme");
  remove.append(closeIcon());
  tile.append(label, remove);
  return tile;
}

function schemeChoice(id, name) {
  const label = document.createElement("label");
  label.className = "scheme";
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "scheme";
  input.value = id;
  input.setAttribute("aria-label", name);
  label.append(input, themeSwatch(id), schemeCheckIcon());
  return label;
}

function themeSwatch(id) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 50 50");
  svg.classList.add("scheme-swatch");
  svg.dataset.schemeSwatch = id;
  svg.setAttribute("aria-hidden", "true");
  for (const [part, box] of [
    ["foreground", [0, 0, 50, 50]],
    ["background", [0, 25, 50, 25]],
    ["base", [25, 25, 25, 25]],
  ]) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.dataset.part = part;
    rect.setAttribute("x", box[0]);
    rect.setAttribute("y", box[1]);
    rect.setAttribute("width", box[2]);
    rect.setAttribute("height", box[3]);
    svg.append(rect);
  }
  return svg;
}

function isOwnPage(url) {
  if (typeof url !== "string" || !url) return false;
  try {
    return url.startsWith(chrome.runtime.getURL("/"));
  } catch {
    return false;
  }
}

function syncHome(button, settings, alreadyHome) {
  if (!button) return;
  const viaButton = settings.useAsHome === true;
  const openedAsNewTab = !new URLSearchParams(location.search).get("surface");
  if (!viaButton && (alreadyHome || openedAsNewTab)) {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  button.textContent = viaButton ? "Don't use as home page" : "Use as home page";
  button.setAttribute("aria-pressed", viaButton ? "true" : "false");
}

function syncForm(form, settings) {
  form.dataset.syncing = "true";
  for (const key of FLAGS) {
    const input = form.elements[key];
    if (input) input.checked = settings[key];
  }
  if (form.elements.showGlow) form.elements.showGlow.checked = themeGlow(settings);
  form.elements.appearance.value = settings.appearance;
  form.elements.themeTab.value = settings.themeTab;
  form.elements.guides.value = settings.guides;
  const schemeList = form.querySelector("#scheme-list");
  const ownThemes = settings.ownThemes ?? [];
  if (selectionNeedsExpand(settings.themeTab, ownThemes, settings.scheme)) schemesExpanded = true;
  renderSchemes(schemeList, settings.themeTab, { expanded: schemesExpanded, ownThemes });
  for (const input of form.querySelectorAll('input[name="scheme"]')) input.checked = input.value === settings.scheme;
  if (schemeList) schemeList.hidden = settings.themeTab === "own" && ownThemes.length === 0;
  const palettes = themePalettes(settings);
  form.elements.remember.value = settings.remember;
  form.elements.rememberMinutes.value = String(settings.rememberMinutes);
  const customTime = form.querySelector("#remember-custom");
  if (customTime) customTime.hidden = settings.remember !== "custom";
  const expandOptions = form.querySelector("#expand-options");
  if (expandOptions) expandOptions.hidden = !settings.showExpandButton;
  const graphOptions = form.querySelector("#graph-options");
  if (graphOptions) graphOptions.hidden = !settings.showGraph;
  const sectionsOptions = form.querySelector("#sections-options");
  if (sectionsOptions) sectionsOptions.hidden = !settings.sectionsEnabled;
  syncBookmarkFolderControl(form, settings);
  for (const mode of ["light", "dark"]) {
    for (const key of ["bg", "ink", "accent"]) {
      const name = `${mode}${key[0].toUpperCase()}${key.slice(1)}`;
      const hex = palettes[mode][key];
      form.elements[name].value = hex;
      form.elements[`${name}Hex`].value = hex;
    }
  }
  paintSwatches(form, settings);
  form.dataset.syncing = "";
}

function paintSwatches(form, settings) {
  const mode = resolvedMode(settings.appearance);
  for (const [id, scheme] of Object.entries(SCHEMES)) paintSwatch(form, id, scheme, mode);
  for (const theme of settings.ownThemes ?? []) paintSwatch(form, `own:${theme.id}`, theme, mode);
}

function paintSwatch(form, id, scheme, mode) {
  const swatch = form.querySelector(`[data-scheme-swatch="${CSS.escape(id)}"]`);
  if (!swatch) return;
  const colors = scheme.swatch?.[mode] ?? {
    foreground: scheme.light.bg,
    background: scheme[mode].accent,
    base: scheme.dark.bg,
  };
  for (const part of ["foreground", "background", "base"]) {
    swatch.querySelector(`[data-part="${part}"]`)?.setAttribute("fill", colors[part]);
  }
}

function themePalettes(settings) {
  const saved = findOwnTheme(settings);
  if (saved) return { light: saved.light, dark: saved.dark };
  if (settings.scheme === "own") return settings.custom;
  const scheme = SCHEMES[settings.scheme];
  return scheme ? { light: scheme.light, dark: scheme.dark } : settings.custom;
}

function findOwnTheme(settings) {
  if (typeof settings.scheme !== "string" || !settings.scheme.startsWith("own:")) return null;
  return (settings.ownThemes ?? []).find((theme) => theme.id === settings.scheme.slice(4)) ?? null;
}

function clonePalette(palette) {
  return {
    light: { bg: palette.light.bg, ink: palette.light.ink, accent: palette.light.accent },
    dark: { bg: palette.dark.bg, ink: palette.dark.ink, accent: palette.dark.accent },
  };
}

function samePalette(a, b) {
  return ["light", "dark"].every((mode) => ["bg", "ink", "accent"].every((key) => a[mode][key] === b[mode][key]));
}

function ownId(themes) {
  let id = "";
  do id = Math.random().toString(36).slice(2, 10);
  while (!id || themes.some((theme) => theme.id === id));
  return id;
}

function rememberOwnTheme(settings) {
  if (settings.scheme !== "own") return false;
  const palette = clonePalette(settings.custom);
  const existing = (settings.ownThemes ?? []).find((theme) => samePalette(theme, palette));
  settings.ownThemes = settings.ownThemes ?? [];
  settings.glow = settings.glow ?? {};
  if (existing) {
    delete settings.glow.own;
    settings.scheme = `own:${existing.id}`;
    return true;
  }
  const id = ownId(settings.ownThemes);
  settings.glow[`own:${id}`] = themeGlow(settings);
  delete settings.glow.own;
  settings.ownThemes.push({ id, ...palette });
  settings.scheme = `own:${id}`;
  return true;
}

function adoptOwn(settings, name, value) {
  const hex = normalizeHex(value);
  const match = /^(light|dark)(Bg|Ink|Accent)$/.exec(name);
  if (!hex || !match) return false;
  const mode = match[1];
  const channel = match[2].toLowerCase();
  settings.ownThemes = settings.ownThemes ?? [];
  settings.glow = settings.glow ?? {};

  const saved = findOwnTheme(settings);
  if (saved) {
    saved[mode][channel] = hex;
    settings.custom = clonePalette(saved);
    settings.themeTab = "own";
    return true;
  }

  const glow = themeGlow(settings);
  const palette = clonePalette(themePalettes(settings));
  palette[mode][channel] = hex;
  if (settings.themeTab !== "own") schemesExpanded = false;
  const id = ownId(settings.ownThemes);
  settings.ownThemes.push({ id, ...palette });
  settings.glow[`own:${id}`] = glow;
  delete settings.glow.own;
  settings.custom = clonePalette(palette);
  settings.scheme = `own:${id}`;
  settings.themeTab = "own";
  return true;
}

function clampMinutes(value) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 43200) return null;
  return minutes;
}

function renderHiddenFolders(settings) {
  const section = document.querySelector("#hidden-section");
  const list = document.querySelector("#hidden-list");
  if (!section || !list) return;
  section.hidden = !settings.showHideButton || settings.folders.length === 0;
  list.replaceChildren();
  for (const folder of settings.folders) {
    const label = hiddenLabel(settings, folder);
    const name = document.createElement("span");
    name.className = "hidden-name";
    name.textContent = folder.title;
    name.title = label;
    const row = document.createElement("li");
    row.className = "hidden-row";
    row.dataset.id = folder.id;
    row.dataset.section = folder.sectionId || "default";
    if (folder.hidden) row.classList.add("is-concealed");
    row.append(name, folderButton(folder, label), forgetButton(folder, label));
    list.append(row);
  }
}

function hiddenLabel(settings, folder) {
  const section = settings.sections.find((entry) => entry.id === (folder.sectionId || "default"));
  const sectionName = section?.title || "Bookmarks";
  return `${sectionName}: ${folder.title}`;
}

function folderButton(folder, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hidden-action";
  button.dataset.action = "toggle";
  button.setAttribute("aria-label", `${folder.hidden ? "Show" : "Hide"} ${label}`);
  button.append(folder.hidden ? eyeIcon() : eyeOffIcon());
  return button;
}

function forgetButton(folder, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hidden-action";
  button.dataset.action = "forget";
  button.setAttribute("aria-label", `Remove ${label} from hidden folders`);
  button.append(closeIcon());
  return button;
}

function sameFolder(folder, sectionId, id) {
  return folder.id === id && (folder.sectionId || "default") === sectionId;
}

function toggleFolder(sectionId, id) {
  const settings = readSettings();
  const folder = settings.folders.find((entry) => sameFolder(entry, sectionId, id));
  if (!folder) return;
  folder.hidden = !folder.hidden;
  commit(settings);
  notifySettings();
  renderHiddenFolders(settings);
}

function forgetFolder(sectionId, id) {
  const settings = readSettings();
  const next = settings.folders.filter((entry) => !sameFolder(entry, sectionId, id));
  if (next.length === settings.folders.length) return;
  settings.folders = next;
  commit(settings);
  notifySettings();
  renderHiddenFolders(settings);
}

function syncBookmarkFolderControl(form, settings) {
  const options = form.querySelector("#bookmark-page-options");
  if (options) options.hidden = !settings.showBookmarkPage;
  const select = form.querySelector("#bookmark-folder");
  if (!(select instanceof HTMLSelectElement)) return;
  const remembered = bookmarkFolders.find((folder) => folder.id === settings.bookmarkFolderId);
  const lastLabel = remembered ? `Last used · ${remembered.title}` : "Last used";
  const signature = `${lastLabel}\n${bookmarkFolders.map((folder) => `${folder.id}\t${folder.depth}\t${folder.title}`).join("\n")}`;
  const syncing = form.dataset.syncing === "true";
  if (!syncing) form.dataset.syncing = "true";
  if (select.dataset.folders !== signature) {
    const last = document.createElement("option");
    last.value = "last";
    last.textContent = lastLabel;
    if (remembered) last.title = remembered.path;
    select.replaceChildren(last);
    for (const folder of bookmarkFolders) {
      const option = document.createElement("option");
      option.value = folder.id;
      option.textContent = `${"\u00a0\u00a0".repeat(folder.depth)}${folder.title}`;
      option.title = folder.path;
      select.append(option);
    }
    select.dataset.folders = signature;
  }
  const pinned = !settings.bookmarkUseLastFolder && bookmarkFolders.some((folder) => folder.id === settings.bookmarkFolderId);
  select.disabled = bookmarkFolders.length === 0;
  select.value = pinned ? settings.bookmarkFolderId : "last";
  if (!syncing) form.dataset.syncing = "";
}

function refreshBookmarkFolders() {
  return loadBookmarkTree()
    .then((tree) => {
      bookmarkFolders = listFolders(tree.roots);
      const form = document.querySelector("#settings-form");
      if (form) syncBookmarkFolderControl(form, readSettings());
    })
    .catch(() => {});
}

function commit(settings) {
  applySettings(settings);
  writeSettings(settings);
}
