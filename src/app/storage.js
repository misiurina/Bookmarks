import { freshExpanded } from "./memory.js";

const LOCAL_KEY = "bookmarks.tree.v1";
const SESSION_KEY = "bookmarks.tree.session";

export async function readRemembered(settings) {
  if (settings.remember === "off") return null;
  if (settings.remember === "session") return freshExpanded(await readSessionRecord(), settings);
  return freshExpanded(readLocalRecord(), settings);
}

export async function writeRemembered(settings, ids) {
  if (settings.remember === "off") return;
  const record = { expanded: [...ids], savedAt: Date.now() };
  if (settings.remember === "session") {
    await writeSessionRecord(record);
    return;
  }
  writeLocalRecord(record);
}

export function watchRemembered(onChange) {
  const onLocal = (event) => {
    if (event.key !== LOCAL_KEY && event.key !== SESSION_KEY) return;
    onChange();
  };
  window.addEventListener("storage", onLocal);

  const area = sessionArea();
  const onSession = (changes) => {
    if (!changes[SESSION_KEY]) return;
    onChange();
  };
  area?.onChanged.addListener(onSession);

  return () => {
    window.removeEventListener("storage", onLocal);
    area?.onChanged.removeListener(onSession);
  };
}

function readLocalRecord() {
  return readRecord(LOCAL_KEY);
}

function writeLocalRecord(record) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(record));
  } catch {
    // Private mode and full storage should not block the tree.
  }
}

async function readSessionRecord() {
  const area = sessionArea();
  if (!area) return readRecord(SESSION_KEY);
  try {
    const stored = await area.get(SESSION_KEY);
    return normalizeRecord(stored?.[SESSION_KEY]);
  } catch {
    return null;
  }
}

async function writeSessionRecord(record) {
  const area = sessionArea();
  if (!area) {
    writeRecord(SESSION_KEY, record);
    return;
  }
  try {
    await area.set({ [SESSION_KEY]: record });
  } catch {
    // The tree still works in this tab if session storage is unavailable.
  }
}

function readRecord(key) {
  try {
    return normalizeRecord(JSON.parse(localStorage.getItem(key) || "null"));
  } catch {
    return null;
  }
}

function writeRecord(key, record) {
  try {
    localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Ignore quota and private-mode failures.
  }
}

function normalizeRecord(data) {
  if (!data || !Array.isArray(data.expanded)) return null;
  return {
    expanded: data.expanded.filter((id) => typeof id === "string"),
    savedAt: typeof data.savedAt === "number" ? data.savedAt : null,
  };
}

function sessionArea() {
  return globalThis.chrome?.storage?.session ?? null;
}
