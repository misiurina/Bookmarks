export function itemLabel(node) {
  const title = node.title.trim();
  if (title) return title;
  if (node.url) return hostname(node.url) || node.url;
  return "Untitled folder";
}

export function cloneSubtree(node) {
  if (node.children) {
    return {
      title: node.title ?? "",
      url: null,
      children: node.children.map(cloneSubtree),
    };
  }
  return { title: node.title ?? "", url: node.url ?? "", children: null };
}

// Index in the parent's current child list. chrome.bookmarks.move treats this
// as the pre-removal position and shifts it down when reordering within a folder.
export function indexForMove(children, beforeId) {
  if (!beforeId) return children.length;
  const index = children.findIndex((child) => child.id === beforeId);
  return index < 0 ? children.length : index;
}

export function isNoopMove(oldIndex, index) {
  return index === oldIndex || index === oldIndex + 1;
}

export function nodeIsInside(byId, nodeId, ancestorId) {
  let current = byId.get(nodeId);
  while (current) {
    if (current.id === ancestorId) return true;
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return false;
}

export function normalizeUrl(value) {
  const text = value.trim();
  if (!text) return "";
  if (/^[a-z][a-z\d+.-]*:/i.test(text)) return text;
  return `https://${text}`;
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
