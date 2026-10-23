import { pinFavourite, readFavourites, reorderFavourite, syncFavouriteSnapshots, unpinFavourite, watchFavourites } from "./store.js";
import { readSettings, watchSettings } from "../settings/theme.js";
import { chevronSpacer, globeSlot, globeSvg } from "../ui/icons.js";

export function mountFavourites({ host, list, dragSession, isEditing, faviconFor, getNeedles, getBookmark }) {
  if (!host || !list) return { paint() {} };

  let items = [];
  let enabled = readSettings().showFavourites;
  let pinDragId = "";
  let marked = null;

  list.addEventListener("error", (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.classList.contains("favicon")) return;
    image.replaceWith(globeSvg());
  }, true);

  const prompt = document.createElement("p");
  prompt.className = "favourites-prompt";
  prompt.hidden = true;
  host.append(prompt);

  host.addEventListener("dragstart", onStart);
  host.addEventListener("dragover", onOver);
  host.addEventListener("dragleave", onLeave);
  host.addEventListener("drop", onDrop);
  window.addEventListener("dragend", onDragEnd);
  document.addEventListener("dragover", onDocumentOver, true);
  document.addEventListener("drop", onDocumentDrop, true);
  watchSettings((settings) => {
    if (settings.showFavourites === enabled) return;
    enabled = settings.showFavourites;
    paint();
  });
  watchFavourites(() => paint());

  function paint() {
    enabled = readSettings().showFavourites;
    syncFavouriteSnapshots(getBookmark);
    items = readFavourites();
    if (!enabled) {
      list.replaceChildren();
      clearMark();
      host.classList.remove("is-empty", "is-editing");
      prompt.hidden = true;
      host.hidden = true;
      return;
    }
    const active = document.activeElement?.closest?.(".tree-anchor");
    const activeId = active && host.contains(active) ? active.dataset.pinId ?? "" : "";
    const needles = getNeedles();
    const visible = items.filter((item) => matches(present(item), needles));
    const editing = isEditing();
    if (visible.length === 0 && !editing) {
      list.replaceChildren();
      clearMark();
      host.classList.remove("is-empty", "is-editing");
      prompt.hidden = true;
      host.hidden = true;
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const item of visible) fragment.append(renderPin(present(item), needles));
    list.replaceChildren(fragment);
    if (pinDragId) list.querySelector(`.tree-anchor[data-pin-id="${CSS.escape(pinDragId)}"]`)?.classList.add("is-dragging");
    if (activeId) list.querySelector(`.tree-anchor[data-pin-id="${CSS.escape(activeId)}"]`)?.focus({ preventScroll: true });
    const empty = visible.length === 0;
    host.classList.toggle("is-empty", empty);
    host.classList.toggle("is-editing", editing);
    prompt.hidden = !editing;
    prompt.textContent = empty ? "Add to favourites" : "+ Add to favourites";
    host.hidden = false;
  }

  function present(item) {
    const node = item.bookmarkId ? getBookmark(item.bookmarkId) : null;
    if (!node || node.children || !node.url) return item;
    return { ...item, title: node.title ?? "", url: node.url };
  }

  function draggingBookmark() {
    return readSettings().showFavourites && isEditing() && Boolean(dragSession.dragId) && !dragSession.folder;
  }

  function onStart(event) {
    if (!isEditing() || !readSettings().showFavourites) return;
    const node = event.target.closest?.(".tree-node");
    const anchor = node?.querySelector(".tree-anchor");
    if (!node || !anchor || !host.contains(node) || !anchor.dataset.pinId) return;
    pinDragId = anchor.dataset.pinId;
    anchor.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", pinDragId);
    dragSession.clearMark();
  }

  function onOver(event) {
    if (pinDragId) {
      if (!isEditing() || !readSettings().showFavourites) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      setUnpinning(false);
      const next = landing(event);
      if (samePlace(pinDragId, next.beforeId)) clearMark();
      else showMark(next);
      return;
    }
    if (!draggingBookmark()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    dragSession.clearMark();
    showMark(landing(event));
  }

  function onLeave(event) {
    if (insideHost(event.relatedTarget)) return;
    clearMark();
    if (pinDragId) setUnpinning(true);
  }

  function onDrop(event) {
    const pinning = Boolean(pinDragId);
    const bookmarkId = dragSession.dragId;
    if (!pinning && !draggingBookmark()) return;
    event.preventDefault();
    event.stopPropagation();
    const next = landing(event);
    clearMark();
    if (pinning) {
      const id = pinDragId;
      pinDragId = "";
      reorderFavourite(id, next.beforeId);
      paint();
      return;
    }
    const node = getBookmark(bookmarkId);
    if (!node || node.children || !node.url) return;
    pinFavourite(node, next.beforeId);
    paint();
  }

  function onDocumentOver(event) {
    if (!pinDragId || insideHost(event.target)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    clearMark();
    setUnpinning(true);
  }

  function onDocumentDrop(event) {
    if (!pinDragId || insideHost(event.target)) return;
    event.preventDefault();
    const id = pinDragId;
    pinDragId = "";
    clearMark();
    unpinFavourite(id);
    paint();
  }

  function onDragEnd() {
    pinDragId = "";
    clearMark();
    for (const row of list.querySelectorAll(".is-dragging, .is-unpinning")) {
      row.classList.remove("is-dragging", "is-unpinning");
    }
  }

  function landing(event) {
    const anchors = [...list.querySelectorAll(".tree-anchor")];
    if (anchors.length === 0) return { beforeId: null, mark: null, zone: "inside" };
    const anchor = event.target?.closest?.(".tree-anchor");
    if (!anchor || !list.contains(anchor)) {
      return { beforeId: null, mark: anchors[anchors.length - 1], zone: "after" };
    }
    const rect = anchor.getBoundingClientRect();
    const before = rect.height === 0 || event.clientY < rect.top + rect.height / 2;
    if (before) return { beforeId: anchor.dataset.pinId, mark: anchor, zone: "before" };
    const next = anchors[anchors.indexOf(anchor) + 1];
    return { beforeId: next?.dataset.pinId ?? null, mark: anchor, zone: "after" };
  }

  function samePlace(id, beforeId) {
    const from = items.findIndex((item) => item.id === id);
    if (from < 0) return false;
    const nextId = items[from + 1]?.id ?? null;
    return beforeId === id || beforeId === nextId;
  }

  function showMark(next) {
    if (!next.mark) {
      if (marked) {
        marked.classList.remove("is-drop-before", "is-drop-after");
        marked = null;
      }
      host.classList.add("is-pin-over");
      return;
    }
    const token = next.zone === "before" ? "is-drop-before" : "is-drop-after";
    if (marked === next.mark && marked.classList.contains(token)) {
      host.classList.remove("is-pin-over");
      return;
    }
    clearMark();
    marked = next.mark;
    marked.classList.add(token);
  }

  function draggedPin() {
    if (!pinDragId) return null;
    return list.querySelector(`.tree-anchor[data-pin-id="${CSS.escape(pinDragId)}"]`);
  }

  function setUnpinning(on) {
    draggedPin()?.classList.toggle("is-unpinning", on);
  }

  function insideHost(target) {
    return target instanceof Node && host.contains(target);
  }

  function clearMark() {
    marked?.classList.remove("is-drop-before", "is-drop-after");
    marked = null;
    host.classList.remove("is-pin-over");
  }

  function renderPin(item, needles) {
    const title = displayTitle(item);
    const row = document.createElement("li");
    row.className = "tree-node";
    const anchor = document.createElement(isEditing() ? "div" : "a");
    anchor.className = "tree-anchor";
    anchor.dataset.pinId = item.id;
    anchor.title = item.url;
    anchor.setAttribute("aria-label", title);
    if (isEditing()) {
      row.draggable = true;
      anchor.draggable = true;
    } else anchor.href = item.url;
    anchor.append(chevronSpacer(), faviconElement(item.url), labelElement(title, needles));
    const address = addressText(item.url, needles);
    if (address) {
      const hostName = document.createElement("span");
      hostName.className = "host";
      hostName.setAttribute("aria-hidden", "true");
      hostName.append(highlightText(address, needles));
      anchor.append(hostName);
    }
    row.append(anchor);
    return row;
  }

  function faviconElement(url) {
    const src = faviconFor(url);
    if (!src) return globeSlot();
    const slot = document.createElement("span");
    slot.className = "glyph";
    slot.setAttribute("aria-hidden", "true");
    const image = document.createElement("img");
    image.className = "favicon";
    image.alt = "";
    image.width = 16;
    image.height = 16;
    image.decoding = "async";
    image.loading = "lazy";
    image.draggable = false;
    image.src = src;
    slot.append(image);
    return slot;
  }

  paint();
  return { paint };
}

function matches(item, needles) {
  const active = needles.map((needle) => String(needle).trim().toLowerCase()).filter(Boolean);
  if (active.length === 0) return true;
  const title = displayTitle(item).toLowerCase();
  const url = item.url.toLowerCase();
  return active.some((needle) => title.includes(needle) || url.includes(needle));
}

function labelElement(title, needles) {
  const label = document.createElement("span");
  label.className = "label";
  label.append(highlightText(title, needles));
  return label;
}

function highlightText(text, needles) {
  const ranges = matchRanges(text, needles);
  if (ranges.length === 0) return document.createTextNode(text);
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) fragment.append(text.slice(cursor, start));
    const mark = document.createElement("mark");
    mark.className = "match";
    mark.textContent = text.slice(start, end);
    fragment.append(mark);
    cursor = end;
  }
  if (cursor < text.length) fragment.append(text.slice(cursor));
  return fragment;
}

function matchRanges(text, needles) {
  const lower = text.toLowerCase();
  const ranges = [];
  for (const needle of needles) {
    const probe = String(needle).toLowerCase();
    if (!probe) continue;
    let index = lower.indexOf(probe);
    while (index !== -1) {
      ranges.push([index, index + probe.length]);
      index = lower.indexOf(probe, index + probe.length);
    }
  }
  ranges.sort((left, right) => left[0] - right[0] || right[1] - left[1]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last || range[0] > last[1]) merged.push([range[0], range[1]]);
    else last[1] = Math.max(last[1], range[1]);
  }
  return merged;
}

function addressText(url, needles) {
  const host = hostname(url);
  const active = needles.map((needle) => String(needle).trim().toLowerCase()).filter(Boolean);
  if (active.length === 0) return host;
  if (active.some((needle) => host.toLowerCase().includes(needle))) return host;
  const bare = String(url).replace(/^[a-z][a-z\d+.-]*:\/\//i, "");
  const lower = bare.toLowerCase();
  let best = -1;
  for (const needle of active) {
    const index = lower.indexOf(needle);
    if (index !== -1 && (best === -1 || index < best)) best = index;
  }
  if (best < 0) return host;
  if (best <= 32) return bare;
  return `\u2026${bare.slice(Math.max(0, best - 10))}`;
}

function displayTitle(item) {
  const title = item.title.trim();
  if (title) return title;
  return hostname(item.url) || item.url;
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
