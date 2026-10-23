import { indexTree, isPermanent, ROOT_ID } from "./model.js";

let fixtureRoots = null;
let fixtureSeq = 1000;
let mute = 0;
const listeners = new Set();

export async function loadBookmarkTree() {
  if (globalThis.chrome?.bookmarks?.getTree) {
    return indexTree(fromChrome(await chrome.bookmarks.getTree()));
  }
  return indexTree(structuredClone(await ensureFixture()));
}

export function watchBookmarks(listener) {
  const api = globalThis.chrome?.bookmarks;
  if (!api?.onCreated) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  let timer = 0;
  const flush = () => {
    if (mute > 0) {
      timer = setTimeout(flush, 60);
      return;
    }
    listener();
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, 50);
  };
  const names = ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered"];
  for (const name of names) api[name].addListener(schedule);

  return () => {
    clearTimeout(timer);
    for (const name of names) api[name].removeListener(schedule);
  };
}

export async function mutateBookmarks(work) {
  mute += 1;
  try {
    return await work();
  } finally {
    mute -= 1;
  }
}

export async function createBookmark({ parentId, title, url, index }) {
  const details = { parentId, title: title ?? "" };
  if (url != null) details.url = url;
  if (index != null) details.index = index;
  if (useChrome()) {
    const created = await chrome.bookmarks.create(details);
    return { id: created.id };
  }
  const children = fixtureChildren(parentId);
  if (!children) throw new Error("Choose a folder.");
  const id = `f${++fixtureSeq}`;
  const item = url == null ? { id, title: details.title, children: [] } : { id, title: details.title, url };
  const at = index == null ? children.length : clamp(index, children.length);
  children.splice(at, 0, item);
  emit();
  return { id };
}

export async function updateBookmark(id, { title, url }) {
  if (useChrome()) {
    const changes = {};
    if (title != null) changes.title = title;
    if (url != null) changes.url = url;
    await chrome.bookmarks.update(id, changes);
    return;
  }
  const found = locate(id);
  if (!found || isPermanent(id)) throw new Error("That folder can't be changed.");
  if (title != null) found.node.title = title;
  if (url != null) {
    if (found.node.children) throw new Error("Folders don't have an address.");
    found.node.url = url;
  }
  emit();
}

export async function removeBookmark(id, folder) {
  if (useChrome()) {
    if (folder) await chrome.bookmarks.removeTree(id);
    else await chrome.bookmarks.remove(id);
    return;
  }
  const found = locate(id);
  if (!found || isPermanent(id)) throw new Error("That folder can't be deleted.");
  found.siblings.splice(found.index, 1);
  emit();
}

export async function moveBookmark(id, { parentId, index }) {
  if (useChrome()) {
    await chrome.bookmarks.move(id, { parentId, index });
    return;
  }
  const found = locate(id);
  const children = fixtureChildren(parentId);
  if (!found || isPermanent(id) || !children) throw new Error("That item can't be moved.");
  if (id === parentId || contains(found.node, parentId)) throw new Error("Can't move a folder into itself.");
  const sameParent = found.siblings === children;
  if (sameParent && (index === found.index || index === found.index + 1)) return;
  const [item] = found.siblings.splice(found.index, 1);
  let at = index ?? children.length;
  if (sameParent && at > found.index) at -= 1;
  children.splice(clamp(at, children.length), 0, item);
  emit();
}

function useChrome() {
  return Boolean(globalThis.chrome?.bookmarks?.getTree);
}

function emit() {
  if (mute > 0) return;
  for (const listener of listeners) listener();
}

async function ensureFixture() {
  if (!fixtureRoots) fixtureRoots = (await import("./fixture.js")).createFixtureRoots();
  return fixtureRoots;
}

function fixtureChildren(parentId) {
  if (parentId === ROOT_ID) return fixtureRoots;
  const parent = locate(parentId);
  return parent?.node.children ?? null;
}

function locate(id, nodes = fixtureRoots, parent = null) {
  if (!nodes) return null;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === id) return { node, parent, siblings: nodes, index };
    if (node.children) {
      const found = locate(id, node.children, node);
      if (found) return found;
    }
  }
  return null;
}

function contains(node, id) {
  if (!node?.children) return false;
  for (const child of node.children) {
    if (child.id === id || contains(child, id)) return true;
  }
  return false;
}

function clamp(index, length) {
  return Math.max(0, Math.min(index, length));
}

function fromChrome(tree) {
  const root = tree?.[0];
  return (root?.children ?? []).map(toRaw);
}

function toRaw(node) {
  if (typeof node.url === "string") {
    return { id: node.id, title: node.title ?? "", url: node.url };
  }
  return {
    id: node.id,
    title: node.title ?? "",
    children: (node.children ?? []).map(toRaw),
  };
}
