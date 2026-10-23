// Classic script so a saved theme is applied before the first paint.
(function () {
  if (new URLSearchParams(location.search).get("surface") === "sidepanel") {
    document.documentElement.dataset.sidePanel = "on";
  }

  const KEY = "bookmarks.settings.v1";
  const EVENT = "bookmarks-settings";
  const THEME_KEYS = [
    "--bg",
    "--glow",
    "--ink",
    "--muted",
    "--faint",
    "--line",
    "--hover",
    "--press",
    "--accent",
    "--selection",
    "--drawer",
  ];

  const CLASSICAL = {
    paper: {
      name: "Paper",
      light: { bg: "#efeae2", ink: "#221e1a", accent: "#8d4b32" },
      dark: { bg: "#121110", ink: "#f3efe8", accent: "#e0a88a" },
    },
    ink: {
      name: "Ink",
      light: { bg: "#f3f4f6", ink: "#1a1d21", accent: "#3c4d63" },
      dark: { bg: "#101214", ink: "#e7eaee", accent: "#a9bfd4" },
    },
    grove: {
      name: "Grove",
      light: { bg: "#e6eee4", ink: "#1b241c", accent: "#2d6a45" },
      dark: { bg: "#111814", ink: "#e7f0e8", accent: "#8fcea8" },
    },
    tide: {
      name: "Tide",
      light: { bg: "#e6eef3", ink: "#162028", accent: "#1d5e86" },
      dark: { bg: "#10161b", ink: "#e6eef3", accent: "#8ec3e0" },
    },
    dusk: {
      name: "Dusk",
      light: { bg: "#f3eef2", ink: "#241820", accent: "#7a3e6a" },
      dark: { bg: "#161116", ink: "#f4eaf0", accent: "#e3a8cf" },
    },
  };

  // Page colors taken from Chromium's color pipeline.
  // The checked default swatch is the hardcoded baseline palette in
  // ui/color/ref_color_mixer.cc, not a generated seed:
  //   light background kColorSysBase = neutral 100, text kColorSysOnSurface = neutral 10,
  //   accent kColorSysPrimary = primary 40 (#0b57d0). Dark uses neutral 25 / 90 and primary 80.
  // Each other Customize Chrome color is ui::GeneratePalette on that swatch's seed and
  // variant (fixed chroma, hue from the seed), then the themed sys overrides:
  //   light background neutral 98, text neutral 10, accent primary 40;
  //   dark background secondary 25, text neutral 90, accent primary 80.
  const CHROME = {
    blue: {
      name: "Default",
      light: { bg: "#ffffff", ink: "#1f1f1f", accent: "#0b57d0" },
      dark: { bg: "#3c3c3c", ink: "#e3e3e3", accent: "#a8c7fa" },
      swatch: {
        light: { foreground: "#d3e3fd", background: "#0b57d0", base: "#c7c7c7" },
        dark: { foreground: "#0842a0", background: "#a8c7fa", base: "#757575" },
      },
    },
    tonal: {
      name: "Blue",
      light: { bg: "#f9f9ff", ink: "#191c20", accent: "#3a5e98" },
      dark: { bg: "#333c4d", ink: "#e2e2e9", accent: "#aac7ff" },
      swatch: {
        light: { foreground: "#d6e3ff", background: "#3a5e98", base: "#aac7ff" },
        dark: { foreground: "#1f467e", background: "#aac7ff", base: "#6e778a" },
      },
    },
    cool: {
      name: "Cool grey",
      light: { bg: "#fcf8fa", ink: "#1b1b1d", accent: "#525f77" },
      dark: { bg: "#383b43", ink: "#e4e2e3", accent: "#bac7e3" },
      swatch: {
        light: { foreground: "#d6e3ff", background: "#525f77", base: "#bac7e3" },
        dark: { foreground: "#3b475e", background: "#bac7e3", base: "#74777f" },
      },
    },
    grey: {
      name: "Grey",
      light: { bg: "#faf9f9", ink: "#1b1c1c", accent: "#516164" },
      dark: { bg: "#343d3f", ink: "#e3e2e2", accent: "#b8cacd" },
      swatch: {
        light: { foreground: "#d4e6e9", background: "#516164", base: "#b8cacd" },
        dark: { foreground: "#39494c", background: "#b8cacd", base: "#6f797a" },
      },
    },
    aqua: {
      name: "Aqua",
      light: { bg: "#f4fbf8", ink: "#161d1c", accent: "#006a62" },
      dark: { bg: "#27403c", ink: "#dde4e2", accent: "#74d7cb" },
      swatch: {
        light: { foreground: "#91f4e7", background: "#006a62", base: "#74d7cb" },
        dark: { foreground: "#005049", background: "#74d7cb", base: "#627c78" },
      },
    },
    green: {
      name: "Green",
      light: { bg: "#f8fbf1", ink: "#191d17", accent: "#3b6930" },
      dark: { bg: "#313f2c", ink: "#e1e4da", accent: "#a0d490" },
      swatch: {
        light: { foreground: "#bbf1a9", background: "#3b6930", base: "#a0d490" },
        dark: { foreground: "#23501b", background: "#a0d490", base: "#6c7b65" },
      },
    },
    viridian: {
      name: "Viridian",
      light: { bg: "#fbf9f6", ink: "#1b1c1a", accent: "#566253" },
      dark: { bg: "#373d35", ink: "#e4e2df", accent: "#becab8" },
      swatch: {
        light: { foreground: "#dae6d3", background: "#566253", base: "#becab8" },
        dark: { foreground: "#3f4a3c", background: "#becab8", base: "#72796f" },
      },
    },
    citron: {
      name: "Citron",
      light: { bg: "#fff9ee", ink: "#1e1b13", accent: "#6f5d00" },
      dark: { bg: "#423b20", ink: "#e9e2d4", accent: "#dec663" },
      swatch: {
        light: { foreground: "#fce27c", background: "#6f5d00", base: "#dec663" },
        dark: { foreground: "#544600", background: "#dec663", base: "#807757" },
      },
    },
    orange: {
      name: "Orange",
      light: { bg: "#fff8f5", ink: "#221a15", accent: "#8e4e1c" },
      dark: { bg: "#4f3625", ink: "#f0dfd7", accent: "#ffb787" },
      swatch: {
        light: { foreground: "#ffdcc7", background: "#8e4e1c", base: "#ffb787" },
        dark: { foreground: "#713704", background: "#ffb787", base: "#90715d" },
      },
    },
    apricot: {
      name: "Apricot",
      light: { bg: "#fff8f5", ink: "#1e1b19", accent: "#705a4d" },
      dark: { bg: "#463931", ink: "#e9e1de", accent: "#dec1b1" },
      swatch: {
        light: { foreground: "#fbdccc", background: "#705a4d", base: "#dec1b1" },
        dark: { foreground: "#574236", background: "#dec1b1", base: "#85746b" },
      },
    },
    rose: {
      name: "Rose",
      light: { bg: "#fff8f7", ink: "#22191b", accent: "#924759" },
      dark: { bg: "#4f3439", ink: "#efdee0", accent: "#ffb1c0" },
      swatch: {
        light: { foreground: "#ffd9df", background: "#924759", base: "#ffb1c0" },
        dark: { foreground: "#753041", background: "#ffb1c0", base: "#906e74" },
      },
    },
    pink: {
      name: "Pink",
      light: { bg: "#fff8f7", ink: "#1e1b1b", accent: "#70585c" },
      dark: { bg: "#46383a", ink: "#e8e1e1", accent: "#ddbfc3" },
      swatch: {
        light: { foreground: "#fadbdf", background: "#70585c", base: "#ddbfc3" },
        dark: { foreground: "#574145", background: "#ddbfc3", base: "#847375" },
      },
    },
    fuchsia: {
      name: "Fuchsia",
      light: { bg: "#fff7f9", ink: "#201a1e", accent: "#834a7d" },
      dark: { bg: "#493545", ink: "#ecdfe5", accent: "#f6b0ea" },
      swatch: {
        light: { foreground: "#ffd7f5", background: "#834a7d", base: "#f6b0ea" },
        dark: { foreground: "#693364", background: "#f6b0ea", base: "#877082" },
      },
    },
    violet: {
      name: "Violet",
      light: { bg: "#fef7ff", ink: "#1d1b20", accent: "#6a5294" },
      dark: { bg: "#3f384c", ink: "#e7e0e8", accent: "#d4bbff" },
      swatch: {
        light: { foreground: "#ebdcff", background: "#6a5294", base: "#d4bbff" },
        dark: { foreground: "#513a7a", background: "#d4bbff", base: "#7c7389" },
      },
    },
  };

  const SCHEMES = { ...CHROME, ...CLASSICAL };
  const THEME_TABS = new Set(["chrome", "classical", "own"]);

  const PAPER = {
    light: {
      "--bg": "#efeae2",
      "--glow": "rgba(255, 248, 238, 0.95)",
      "--ink": "#221e1a",
      "--muted": "#746c62",
      "--faint": "#655d53",
      "--line": "rgba(34, 30, 26, 0.14)",
      "--hover": "rgba(34, 30, 26, 0.05)",
      "--press": "rgba(34, 30, 26, 0.09)",
      "--accent": "#8d4b32",
      "--selection": "rgba(141, 75, 50, 0.2)",
      "--drawer": "#e4ddd2",
    },
    dark: {
      "--bg": "#121110",
      "--glow": "rgba(255, 214, 170, 0.06)",
      "--ink": "#f3efe8",
      "--muted": "#b1a89d",
      "--faint": "#8a8176",
      "--line": "rgba(243, 239, 232, 0.14)",
      "--hover": "rgba(255, 255, 255, 0.045)",
      "--press": "rgba(255, 255, 255, 0.08)",
      "--accent": "#e0a88a",
      "--selection": "rgba(224, 168, 138, 0.24)",
      "--drawer": "#1c1b19",
    },
  };

  const DEFAULT_SETTINGS = {
    showCounts: true,
    showAddresses: true,
    showFavicons: true,
    indentFavicons: false,
    colorOpenFolders: true,
    showGraph: false,
    recenterGraph: false,
    showExpandButton: false,
    showHideButton: false,
    showAddRow: false,
    showBookmarkPage: false,
    bookmarkUseLastFolder: true,
    bookmarkFolderId: "",
    showFavourites: false,
    sectionsEnabled: false,
    showSections: true,
    revealSections: false,
    doubleClickBranch: false,
    doubleClickRename: false,
    guides: "bar",
    expandDepth: 1,
    remember: "session",
    rememberMinutes: 60,
    folders: [],
    sections: [{ id: "default", folderId: "0", visible: true, title: "Bookmarks", graph: false }],
    filters: [],
    appearance: "system",
    scheme: "blue",
    themeTab: "chrome",
    useAsHome: false,
    previousHome: "",
    custom: {
      light: { bg: "#efeae2", ink: "#221e1a", accent: "#8d4b32" },
      dark: { bg: "#121110", ink: "#f3efe8", accent: "#e0a88a" },
    },
    ownThemes: [],
    glow: {},
  };

  const FLAG_KEYS = ["showCounts", "showAddresses", "showFavicons", "indentFavicons", "colorOpenFolders", "showGraph", "recenterGraph", "showExpandButton", "showHideButton", "showAddRow", "showBookmarkPage", "bookmarkUseLastFolder", "sectionsEnabled", "showSections", "revealSections", "doubleClickBranch", "doubleClickRename", "showFavourites"];
  const GUIDE_STYLES = new Set(["none", "bar", "elbow"]);

  function normalizeHex(value) {
    let hex = String(value ?? "").trim();
    if (!hex.startsWith("#")) hex = `#${hex}`;
    if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : null;
  }

  function readSettings() {
    const settings = structuredClone(DEFAULT_SETTINGS);
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!raw || typeof raw !== "object") return settings;
      for (const key of FLAG_KEYS) {
        if (typeof raw[key] === "boolean") settings[key] = raw[key];
      }
      settings.useAsHome = raw.useAsHome === true;
      settings.previousHome = typeof raw.previousHome === "string" ? raw.previousHome : "";
      if (raw.appearance === "system" || raw.appearance === "light" || raw.appearance === "dark") {
        settings.appearance = raw.appearance;
      }
      if (GUIDE_STYLES.has(raw.guides)) settings.guides = raw.guides;
      else if (raw.showGuides === false) settings.guides = "none";
      const rememberChoices = new Set(["off", "session", "forever", "15", "60", "240", "1440", "custom"]);
      if (rememberChoices.has(raw.remember)) settings.remember = raw.remember;
      const minutes = Number(raw.rememberMinutes);
      if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 43200) settings.rememberMinutes = minutes;
      if (typeof raw.bookmarkFolderId === "string") {
        const folderId = raw.bookmarkFolderId.trim();
        if (folderId && folderId !== "0" && folderId.length <= 64) settings.bookmarkFolderId = folderId;
      }
      if (Array.isArray(raw.folders)) settings.folders = readFolders(raw.folders);
      if (Array.isArray(raw.sections)) settings.sections = readSections(raw.sections);
      if (Array.isArray(raw.filters)) settings.filters = readFilters(raw.filters);
      settings.ownThemes = readOwnThemes(raw.ownThemes);
      settings.glow = readGlow(raw.glow);
      if (raw.scheme === "custom") settings.scheme = "own";
      else if (raw.scheme === "own" || Object.prototype.hasOwnProperty.call(SCHEMES, raw.scheme)) {
        settings.scheme = raw.scheme;
      } else if (typeof raw.scheme === "string" && raw.scheme.startsWith("own:")) {
        const id = raw.scheme.slice(4);
        settings.scheme = settings.ownThemes.some((theme) => theme.id === id) ? raw.scheme : "own";
      }
      if (THEME_TABS.has(raw.themeTab)) settings.themeTab = raw.themeTab;
      settings.custom = readCustom(raw.custom, settings.custom);
    } catch {
      return settings;
    }
    return settings;
  }

  function readPalette(raw) {
    if (!raw || typeof raw !== "object") return null;
    const palette = {};
    for (const key of ["bg", "ink", "accent"]) {
      const hex = normalizeHex(raw[key]);
      if (!hex) return null;
      palette[key] = hex;
    }
    return palette;
  }

  function readGlow(raw) {
    const glow = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return glow;
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "boolean" && /^[a-z0-9:]+$/.test(key)) glow[key] = value;
    }
    return glow;
  }

  function readOwnThemes(raw) {
    if (!Array.isArray(raw)) return [];
    const themes = [];
    const seen = new Set();
    for (const entry of raw) {
      if (!entry || typeof entry.id !== "string" || !/^[a-z0-9]+$/.test(entry.id) || seen.has(entry.id)) continue;
      const light = readPalette(entry.light);
      const dark = readPalette(entry.dark);
      if (!light || !dark) continue;
      seen.add(entry.id);
      themes.push({ id: entry.id, light, dark });
    }
    return themes;
  }

  function readCustom(raw, base) {
    const custom = structuredClone(base);
    if (!raw || typeof raw !== "object") return custom;
    if (raw.light || raw.dark) {
      for (const mode of ["light", "dark"]) {
        if (!raw[mode] || typeof raw[mode] !== "object") continue;
        for (const key of ["bg", "ink", "accent"]) {
          const hex = normalizeHex(raw[mode][key]);
          if (hex) custom[mode][key] = hex;
        }
      }
      return custom;
    }
    const legacy = {};
    for (const key of ["bg", "ink", "accent"]) {
      const hex = normalizeHex(raw[key]);
      if (hex) legacy[key] = hex;
    }
    if (!legacy.bg) return custom;
    const mode = luminance(hexToRgb(legacy.bg)) < 0.4 ? "dark" : "light";
    custom[mode] = { ...custom[mode], ...legacy };
    return custom;
  }

  function readFolders(entries) {
    const folders = [];
    const seen = new Set();
    for (const entry of entries) {
      if (!entry || typeof entry.id !== "string" || !entry.id) continue;
      const sectionId = typeof entry.sectionId === "string" && entry.sectionId.trim() ? entry.sectionId.trim() : "default";
      const key = `${sectionId}\0${entry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const title = typeof entry.title === "string" ? entry.title.trim() : "";
      folders.push({
        id: entry.id,
        sectionId,
        title: title || "Untitled folder",
        hidden: entry.hidden === true,
      });
      if (folders.length >= 500) break;
    }
    return folders;
  }

  function readSections(entries) {
    const sections = [];
    const seenIds = new Set();
    const seenFolders = new Set();
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id || seenIds.has(entry.id)) continue;
      if (entry.id === "default") {
        sections.push({ id: "default", folderId: "0", visible: entry.visible !== false, title: "Bookmarks", graph: entry.graph === true });
        seenIds.add("default");
        seenFolders.add("0");
        continue;
      }
      const folderId = typeof entry.folderId === "string" ? entry.folderId.trim() : "";
      if (!folderId || folderId === "0" || seenFolders.has(folderId)) continue;
      const title = typeof entry.title === "string" ? entry.title.trim() : "";
      sections.push({
        id: entry.id,
        folderId,
        visible: entry.visible !== false,
        title: title || "Untitled folder",
        graph: entry.graph === true,
      });
      seenIds.add(entry.id);
      seenFolders.add(folderId);
      if (sections.length >= 40) break;
    }
    if (!seenIds.has("default")) {
      sections.unshift({ id: "default", folderId: "0", visible: true, title: "Bookmarks", graph: false });
    }
    return sections;
  }

  function readFilters(entries) {
    const filters = [];
    const seenQuery = new Set();
    const seenId = new Set();
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const query = typeof entry.query === "string" ? entry.query.trim().slice(0, 120) : "";
      if (!query) continue;
      const queryKey = query.toLowerCase();
      if (seenQuery.has(queryKey)) continue;
      let id = typeof entry.id === "string" ? entry.id.trim() : "";
      if (!id || seenId.has(id)) id = `filter-${filters.length}-${queryKey.slice(0, 24)}`;
      if (seenId.has(id)) continue;
      seenQuery.add(queryKey);
      seenId.add(id);
      filters.push({ id, query, selected: entry.selected === true });
      if (filters.length >= 40) break;
    }
    return filters;
  }

  function writeSettings(settings) {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // Keep the in-memory theme even if storage is unavailable.
    }
  }

  function resolvedMode(appearance) {
    if (appearance === "light" || appearance === "dark") return appearance;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function resolvePalette(settings) {
    if (typeof settings.scheme === "string" && settings.scheme.startsWith("own:")) {
      const saved = settings.ownThemes.find((theme) => theme.id === settings.scheme.slice(4));
      if (saved) return { ...saved[resolvedMode(settings.appearance)] };
    }
    if (settings.scheme === "own") return { ...settings.custom[resolvedMode(settings.appearance)] };
    const scheme = SCHEMES[settings.scheme] ?? SCHEMES.blue;
    return { ...scheme[resolvedMode(settings.appearance)] };
  }

  function themeGlow(settings) {
    const stored = settings.glow?.[settings.scheme];
    if (typeof stored === "boolean") return stored;
    return Boolean(CLASSICAL[settings.scheme]);
  }

  function hexToRgb(hex) {
    const value = parseInt(hex.slice(1), 16);
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
  }

  function mix(a, b, amount) {
    return {
      r: Math.round(a.r + (b.r - a.r) * amount),
      g: Math.round(a.g + (b.g - a.g) * amount),
      b: Math.round(a.b + (b.b - a.b) * amount),
    };
  }

  function rgba(rgb, alpha) {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  function rgb(value) {
    return `rgb(${value.r}, ${value.g}, ${value.b})`;
  }

  function luminance(value) {
    const channel = (part) => {
      const srgb = part / 255;
      return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(value.r) + 0.7152 * channel(value.g) + 0.0722 * channel(value.b);
  }

  function derive(palette) {
    const bg = hexToRgb(palette.bg);
    const ink = hexToRgb(palette.ink);
    const accent = hexToRgb(palette.accent);
    const dark = luminance(bg) < 0.4;
    return {
      "--bg": rgb(bg),
      "--glow": dark ? rgba(accent, 0.14) : rgba(mix(bg, { r: 255, g: 252, b: 246 }, 0.72), 0.95),
      "--ink": rgb(ink),
      "--muted": rgb(mix(ink, bg, dark ? 0.34 : 0.45)),
      "--faint": rgb(mix(ink, bg, dark ? 0.5 : 0.58)),
      "--line": rgba(ink, dark ? 0.16 : 0.14),
      "--hover": rgba(ink, dark ? 0.08 : 0.05),
      "--press": rgba(ink, dark ? 0.13 : 0.09),
      "--accent": rgb(accent),
      "--selection": rgba(accent, dark ? 0.28 : 0.2),
      "--drawer": rgb(mix(bg, ink, dark ? 0.14 : 0.05)),
    };
  }

  const MARK_PATH = "M3.6 1.5h8.8A1.1 1.1 0 0 1 13.5 2.6V14.5L8 11.2 2.5 14.5V2.6A1.1 1.1 0 0 1 3.6 1.5z";

  function faviconHref(fill) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="${fill}" d="${MARK_PATH}"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function applyFavicon(fill) {
    const link = document.querySelector('link[rel="icon"]');
    if (link) {
      const href = fill ? faviconHref(fill) : "favicon.svg";
      if (link.getAttribute("href") !== href) {
        link.type = "image/svg+xml";
        link.href = href;
      }
    }
    applyActionIcon(fill);
  }

  function actionIconFill(fill) {
    return fill || globalThis.__bookmarksActionIcon?.DEFAULT_FILL || "#a8c7fa";
  }

  function applyActionIcon(fill) {
    const painter = globalThis.__bookmarksActionIcon;
    const color = actionIconFill(fill);
    if (!painter || !globalThis.chrome?.action?.setIcon) return;
    painter.paint(color).catch(() => {});
    const saved = chrome.storage?.local?.set({ [painter.STORAGE_KEY]: color });
    saved?.catch?.(() => {});
  }

  function clearTheme(root) {
    for (const key of THEME_KEYS) root.style.removeProperty(key);
    root.style.colorScheme = "";
  }

  function applySettings(settings) {
    const root = document.documentElement;
    root.dataset.counts = settings.showCounts ? "on" : "off";
    root.dataset.addresses = settings.showAddresses ? "on" : "off";
    root.dataset.favicons = settings.showFavicons ? "on" : "off";
    root.dataset.indentFavicons = settings.indentFavicons ? "on" : "off";
    root.dataset.openColor = settings.colorOpenFolders ? "on" : "off";
    root.dataset.glow = themeGlow(settings) ? "on" : "off";
    root.dataset.expandButton = settings.showExpandButton ? "on" : "off";
    root.dataset.hideButton = settings.showHideButton ? "on" : "off";
    root.dataset.addRow = settings.showAddRow ? "on" : "off";
    root.dataset.bookmarkPage = settings.showBookmarkPage ? "on" : "off";
    root.dataset.multiSections = settings.sectionsEnabled ? "on" : "off";
    root.dataset.sections = settings.showSections ? "on" : "off";
    if (!root.dataset.sectionsOpen) root.dataset.sectionsOpen = settings.sectionsEnabled && settings.showSections ? "on" : "off";
    root.dataset.guides = settings.guides;

    if (settings.scheme === "paper" && settings.appearance === "system") {
      clearTheme(root);
      applyFavicon(null);
      return;
    }

    const palette = resolvePalette(settings);
    const mode = resolvedMode(settings.appearance);
    const vars = settings.scheme === "paper" ? PAPER[mode] : derive(palette);
    for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
    root.style.colorScheme = mode;
    applyFavicon(vars["--accent"]);
  }

  function publish() {
    window.dispatchEvent(new CustomEvent(EVENT));
  }

  applySettings(readSettings());

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const settings = readSettings();
    if (settings.appearance !== "system") return;
    applySettings(settings);
    publish();
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== KEY) return;
    applySettings(readSettings());
    publish();
  });

  globalThis.__bookmarksSettings = {
    EVENT,
    SCHEMES,
    CHROME,
    CLASSICAL,
    DEFAULT_SETTINGS,
    readSettings,
    writeSettings,
    applySettings,
    resolvePalette,
    resolvedMode,
    themeGlow,
    normalizeHex,
  };
})();
