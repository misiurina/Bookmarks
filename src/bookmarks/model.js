const numberFormat = new Intl.NumberFormat();

export const ROOT_ID = "0";

const PERMANENT_IDS = new Set(["1", "2", "3"]);

export function isPermanent(id) {
  return PERMANENT_IDS.has(String(id));
}

export function listFolders(roots) {
  const folders = [];
  const walk = (nodes, depth, path) => {
    for (const node of nodes) {
      if (!node.children) continue;
      const title = node.title.trim() || "Untitled folder";
      const nextPath = path ? `${path} / ${title}` : title;
      folders.push({ id: node.id, title, depth, path: nextPath });
      walk(node.children, depth + 1, nextPath);
    }
  };
  walk(roots, 0, "");
  return folders;
}

// Other bookmarks, then the bookmarks bar, then mobile. Used until a saved folder exists.
const FOLDER_FALLBACK = ["2", "1", "3"];

export function preferredFolderId(folders, stored) {
  if (stored && folders.some((folder) => folder.id === stored)) return stored;
  for (const id of FOLDER_FALLBACK) {
    if (folders.some((folder) => folder.id === id)) return id;
  }
  return folders[0]?.id ?? "";
}

export function indexTree(rawRoots) {
  const byId = new Map();
  const stats = { bookmarks: 0, folders: 0 };
  const roots = rawRoots.map((raw) => indexNode(raw, ROOT_ID, byId, stats));
  return { roots, byId, stats };
}

export function folderIdsInBranch(node, hidden) {
  const ids = [];
  const walk = (current) => {
    if (!current?.children || hidden.has(current.id)) return;
    ids.push(current.id);
    for (const child of current.children) walk(child);
  };
  walk(node);
  return ids;
}

export function folderIdsWithinDepth(roots, depth) {
  const ids = [];
  if (depth <= 0) return ids;
  const walk = (nodes, level) => {
    for (const node of nodes) {
      if (!node.children || level >= depth) continue;
      ids.push(node.id);
      walk(node.children, level + 1);
    }
  };
  walk(roots, 0);
  return ids;
}

export function countTree(nodes) {
  const stats = { bookmarks: 0, folders: 0 };
  const walk = (node) => {
    if (node.children) {
      stats.folders += 1;
      for (const child of node.children) walk(child);
    } else stats.bookmarks += 1;
  };
  for (const node of nodes) walk(node);
  return stats;
}

export function formatSummary(stats) {
  const bookmarkLabel = stats.bookmarks === 1 ? "bookmark" : "bookmarks";
  const folderLabel = stats.folders === 1 ? "folder" : "folders";
  return `${numberFormat.format(stats.bookmarks)} ${bookmarkLabel} · ${numberFormat.format(stats.folders)} ${folderLabel}`;
}

export function formatMatchSummary(matches) {
  if (matches === 0) return "No matches";
  return `${numberFormat.format(matches)} ${matches === 1 ? "match" : "matches"}`;
}

// A matching folder keeps its contents. Other folders stay only as the path to a match.
// Several queries match with OR: a bookmark is kept when any query matches it.
export function filterBookmarks(roots, queries, hidden) {
  const needles = [...new Set(queries.map((query) => String(query).trim().toLowerCase()).filter(Boolean))];
  const forceOpen = new Set();
  const byId = new Map();
  let matches = 0;
  if (needles.length === 0) return { roots, byId, forceOpen, matches };

  const visit = (node, withinMatch) => {
    if (hidden.has(node.id)) return null;
    const matched = needles.some((needle) => matchesQuery(node, needle));
    if (matched) matches += 1;

    if (!node.children) {
      if (!matched && !withinMatch) return null;
      byId.set(node.id, node);
      return node;
    }

    const showChildren = matched || withinMatch;
    const children = [];
    let descendantMatch = false;
    for (const child of node.children) {
      const next = visit(child, showChildren);
      if (!next) continue;
      children.push(next);
      if (!showChildren) descendantMatch = true;
    }
    if (!matched && !descendantMatch && !withinMatch) return null;
    if (matched || descendantMatch) forceOpen.add(node.id);
    const copy = { ...node, children };
    byId.set(copy.id, copy);
    return copy;
  };

  const nextRoots = [];
  for (const root of roots) {
    const next = visit(root, false);
    if (next) nextRoots.push(next);
  }
  return { roots: nextRoots, byId, forceOpen, matches };
}

function matchesQuery(node, needle) {
  const title = node.title.trim();
  const label = title || (node.children ? "Untitled folder" : "");
  if (label.toLowerCase().includes(needle)) return true;
  return Boolean(node.url && node.url.toLowerCase().includes(needle));
}

function indexNode(raw, parentId, byId, stats) {
  const isFolder = raw.url == null;
  const item = {
    id: String(raw.id),
    parentId,
    title: raw.title ?? "",
    url: isFolder ? null : String(raw.url),
    children: null,
  };

  if (isFolder) {
    stats.folders += 1;
    item.children = (raw.children ?? []).map((child) => indexNode(child, item.id, byId, stats));
  } else {
    stats.bookmarks += 1;
  }

  byId.set(item.id, item);
  return item;
}
