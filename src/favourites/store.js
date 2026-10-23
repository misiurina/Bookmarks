// Pinned bookmarks are stored on this device only. Pinning never creates,
// moves, or deletes a Chrome bookmark.

const KEY = "bookmarks.favourites.v1";
const MAX = 200;

export function readFavourites() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!Array.isArray(raw)) return [];
    return normalize(raw);
  } catch {
    return [];
  }
}

export function writeFavourites(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Private mode and full storage should not block the page.
  }
}

export function watchFavourites(onChange) {
  const onStorage = (event) => {
    if (event.key !== KEY) return;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

export function pinFavourite(node, beforeId) {
  if (!node?.url || node.children) return false;
  const items = readFavourites();
  const existing = items.find((item) => item.bookmarkId === node.id);
  if (existing) return reorderFavourite(existing.id, beforeId);
  if (items.length >= MAX) return false;
  const pin = {
    id: crypto.randomUUID(),
    bookmarkId: String(node.id),
    title: node.title ?? "",
    url: node.url,
  };
  items.splice(indexBefore(items, beforeId), 0, pin);
  writeFavourites(items);
  return true;
}

export function reorderFavourite(id, beforeId) {
  const items = readFavourites();
  const from = items.findIndex((item) => item.id === id);
  if (from < 0) return false;
  const nextId = items[from + 1]?.id ?? null;
  if (beforeId === id || beforeId === nextId) return false;
  const [item] = items.splice(from, 1);
  items.splice(indexBefore(items, beforeId), 0, item);
  writeFavourites(items);
  return true;
}

export function unpinFavourite(id) {
  const items = readFavourites();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  writeFavourites(next);
  return true;
}

export function syncFavouriteSnapshots(getNode) {
  const items = readFavourites();
  let changed = false;
  for (const item of items) {
    if (!item.bookmarkId) continue;
    const node = getNode(item.bookmarkId);
    if (!node || node.children || !node.url) continue;
    const title = node.title ?? "";
    if (item.title === title && item.url === node.url) continue;
    item.title = title;
    item.url = node.url;
    changed = true;
  }
  if (changed) writeFavourites(items);
  return changed;
}

function indexBefore(items, beforeId) {
  if (!beforeId) return items.length;
  const index = items.findIndex((item) => item.id === beforeId);
  return index < 0 ? items.length : index;
}

function normalize(entries) {
  const items = [];
  const seen = new Set();
  const seenBookmarks = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    if (!id || !url || seen.has(id)) continue;
    const bookmarkId = typeof entry.bookmarkId === "string" ? entry.bookmarkId : "";
    if (bookmarkId && seenBookmarks.has(bookmarkId)) continue;
    seen.add(id);
    if (bookmarkId) seenBookmarks.add(bookmarkId);
    items.push({
      id,
      bookmarkId,
      title: typeof entry.title === "string" ? entry.title : "",
      url,
    });
    if (items.length >= MAX) break;
  }
  return items;
}
