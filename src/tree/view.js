import { isPermanent, ROOT_ID } from "../bookmarks/model.js";
import { attachTreeDrag, createDragSession } from "./drag.js";
import { bookmarkPlusIcon, chevronSlot, chevronSpacer, collapseAllIcon, expandAllIcon, eyeIcon, eyeOffIcon, folderPlusIcon, folderSlot, globeSlot, globeSvg, pencilIcon, plusIcon, trashIcon } from "../ui/icons.js";

const CHUNK = 60;
const ITEM = '[role="treeitem"]';

export function createTreeView(host, {
  faviconFor,
  isOpen,
  isHidden,
  onToggle,
  onToggleHidden,
  onBranch,
  getNeedles,
  isEditing = () => false,
  onEdit = () => {},
  onDelete = () => {},
  onAdd = () => {},
  onCreate = () => {},
  showAddRow = () => false,
  doubleClickBranch = () => true,
  doubleClickRename = () => true,
  onMove = () => {},
  onFolderCommit = () => {},
  onFolderCancel = () => {},
  dragSession = null,
}) {
  let byId = new Map();
  let roots = [];
  let rootParentId = ROOT_ID;
  let editing = false;
  let rebuilding = false;
  let labelEdit = null;
  let branchGesture = null;
  let buttonPress = false;
  let focusBeforeButton = null;
  let restoringFocus = false;

  host.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest("input, textarea, select")) return;
    const button = target.closest("button");
    const item = target.closest(ITEM);
    if (button) {
      if (!host.contains(button)) return;
      buttonPress = true;
      focusBeforeButton = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      event.preventDefault();
      return;
    }
    if (!item || !host.contains(item)) return;
    if (editing && item.draggable) return;
    event.preventDefault();
  }, true);

  host.addEventListener("focusin", (event) => {
    if (!buttonPress || restoringFocus) return;
    const target = event.target;
    if (!(target instanceof Element) || !host.contains(target) || target.closest("input, textarea")) return;
    if (!target.closest(ITEM)) return;
    const back = focusBeforeButton;
    if (back === target) return;
    event.stopImmediatePropagation();
    restoringFocus = true;
    if (back?.isConnected) back.focus({ preventScroll: true });
    else if (!labelEdit?.input?.isConnected) target.blur();
    restoringFocus = false;
  }, true);

  window.addEventListener("pointerup", releaseButtonPress);
  window.addEventListener("pointercancel", releaseButtonPress);

  host.addEventListener("click", (event) => {
    if (buttonPress) settleButtonFocus();
    const create = event.target.closest?.(".tree-add-folder, .tree-add-bookmark");
    if (create && host.contains(create)) {
      event.preventDefault();
      onCreate(create.dataset.id, create.dataset.kind, create);
      return;
    }
    const action = event.target.closest?.(".add-item, .edit-item, .delete-item");
    if (action && host.contains(action)) {
      event.preventDefault();
      const id = action.dataset.id;
      if (action.classList.contains("add-item")) onAdd(id, action);
      else if (action.classList.contains("edit-item")) onEdit(id, action);
      else onDelete(id);
      return;
    }
    const branch = event.target.closest?.(".branch-folder");
    if (branch && host.contains(branch)) {
      event.preventDefault();
      onBranch(branch.dataset.id, branch.dataset.action === "expand");
      return;
    }
    const hide = event.target.closest?.(".hide-folder");
    if (hide && host.contains(hide)) {
      event.preventDefault();
      const row = hide.closest(ITEM);
      onToggleHidden(hide.dataset.id, row?.dataset.label || "");
      return;
    }
    const item = event.target.closest?.(ITEM);
    if (!item || !host.contains(item) || !item.hasAttribute("aria-expanded")) return;
    if (event.target.closest?.(".label-input")) return;
    if (editing && event.target.closest?.(".label")) {
      if (event.detail > 1 && doubleClickRename()) editFolderLabel(item.dataset.id);
      else toggle(item.dataset.id);
      return;
    }
    if (!editing) {
      const id = item.dataset.id;
      if (event.detail > 1 && doubleClickBranch() && branchGesture?.id === id) {
        const expand = branchGesture.expand;
        branchGesture = null;
        onBranch(id, expand);
        return;
      }
      if (doubleClickBranch()) {
        const node = byId.get(id);
        branchGesture = { id, expand: Boolean(node) && !branchIsOpen(node) };
      } else branchGesture = null;
      toggle(id);
      return;
    }
    toggle(item.dataset.id);
  });

  host.addEventListener("dblclick", (event) => {
    if (event.target.closest?.("button, input, textarea")) return;
    const item = event.target.closest?.(ITEM);
    if (!item || !host.contains(item) || !item.hasAttribute("aria-expanded")) return;
    if (editing) {
      if (!doubleClickRename() || item.dataset.fixed === "true" || !event.target.closest?.(".label")) return;
      event.preventDefault();
      editFolderLabel(item.dataset.id);
      return;
    }
    if (!doubleClickBranch() || branchGesture?.id !== item.dataset.id) return;
    event.preventDefault();
    const expand = branchGesture.expand;
    branchGesture = null;
    onBranch(item.dataset.id, expand);
  });

  host.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.classList.contains("favicon")) return;
      image.replaceWith(globeSvg());
    },
    true,
  );

  function setTree(nextRoots, index, parentId = ROOT_ID) {
    roots = nextRoots;
    byId = index;
    rootParentId = parentId || ROOT_ID;
    editing = isEditing();
    rebuilding = true;
    cancelFills();
    host.replaceChildren(buildList(nextRoots, rootParentId));
    rebuilding = false;
    ensureTabstop();
  }

  function showMessage(text) {
    cancelFills();
    byId = new Map();
    const message = document.createElement("p");
    message.className = "tree-message";
    message.textContent = text;
    host.replaceChildren(message);
  }

  function releaseButtonPress() {
    if (!buttonPress) return;
    const edit = labelEdit;
    buttonPress = false;
    focusBeforeButton = null;
    if (!edit?.suspended) return;
    edit.suspended = false;
    if (document.activeElement !== edit.input) edit.finish(true);
  }

  function settleButtonFocus() {
    releaseButtonPress();
  }

  function toggle(id) {
    const node = byId.get(id);
    if (!node?.children) return;
    const next = !isOpen(id);
    onToggle(id, next);
    syncOpen(id);
  }

  function syncOpen(id) {
    const node = byId.get(id);
    if (!node?.children) return;
    const item = findItem(id);
    const folder = item?.closest(".tree-node");
    if (!item || !folder) return;
    const next = isOpen(id);
    item.setAttribute("aria-expanded", next ? "true" : "false");
    const list = folder.querySelector(":scope > .tree-children");
    if (next) {
      if (!list) folder.append(buildList(node.children, id));
    } else if (list) {
      list._cancelFill?.();
      list.remove();
    }
    syncBranchButtons(id);
  }

  function focus(id) {
    const item = findItem(id);
    if (!item) return false;
    for (const entry of host.querySelectorAll(`${ITEM}[tabindex="0"]`)) {
      if (entry !== item) entry.tabIndex = -1;
    }
    item.tabIndex = 0;
    item.focus({ preventScroll: true });
    return true;
  }

  function labelDraft() {
    if (!labelEdit?.input.isConnected) return null;
    return {
      id: labelEdit.id,
      fresh: labelEdit.fresh,
      value: labelEdit.input.value,
      start: labelEdit.input.selectionStart,
      end: labelEdit.input.selectionEnd,
    };
  }

  function editFolderLabel(id, options = {}) {
    const row = findItem(id);
    const node = byId.get(id);
    if (!row || !node || row.dataset.fixed === "true" || (!node.children && node.url == null)) return false;
    const label = row.querySelector(":scope > .label");
    if (!label) return Boolean(row.querySelector(":scope > .label-input"));
    const fresh = Boolean(options.fresh);
    const folder = Boolean(node.children);
    const input = document.createElement("input");
    input.type = "text";
    input.className = "label-input";
    input.value = options.value != null ? options.value : node.title ?? "";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.setAttribute("aria-label", folder ? "Folder name" : "Bookmark name");
    input.addEventListener("mousedown", (event) => event.stopPropagation());
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("dblclick", (event) => event.stopPropagation());
    let done = false;
    const finish = (save, silent = false) => {
      if (done) return;
      done = true;
      if (labelEdit?.input === input) labelEdit = null;
      const next = input.value.trim();
      if (input.isConnected && (save || !fresh)) {
        const name = save ? displayTitle({ ...node, title: next }) : displayTitle(node);
        input.replaceWith(labelElement(name, getNeedles()));
        row.dataset.label = name;
        row.title = node.url || name;
        row.setAttribute("aria-label", name);
        if (editing && !isPermanent(node.id) && !node.pending) row.draggable = true;
      }
      if (silent) return;
      if (!save) onFolderCancel(id, { fresh });
      else onFolderCommit(id, next, { fresh });
    };
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => {
      if (done || rebuilding || !input.isConnected) return;
      // A press on another button can move focus onto its row for a moment.
      // Committing here deletes the field, and the focus restore then focuses
      // that detached field and blurs the row, which repeats while the pointer
      // is over the button.
      if (buttonPress) {
        if (labelEdit) labelEdit.suspended = true;
        return;
      }
      finish(true);
    });
    label.replaceWith(input);
    row.draggable = false;
    row.title = "";
    labelEdit = { id, input, fresh, suspended: false, finish };
    input.focus({ preventScroll: true });
    if (options.start != null && options.end != null) input.setSelectionRange(options.start, options.end);
    else input.select();
    if (options.scroll) input.scrollIntoView({ block: "nearest" });
    return true;
  }

  function finishLabel() {
    if (!labelEdit?.input.isConnected) return;
    labelEdit.finish(true);
  }

  function focusNeighbor(id) {
    const row = findItem(id);
    const node = row?.closest(".tree-node");
    if (!row || !node) return "";
    const nextId = neighborId(row, node);
    if (nextId) focus(nextId);
    return nextId;
  }

  function buildList(nodes, parentId) {
    const visible = editing ? nodes : nodes.filter((node) => !isHidden(node.id));
    const list = document.createElement("ul");
    list.className = "tree-children";
    list.setAttribute("role", "group");
    const tail = wantsAddRow(parentId) ? addRow(parentId) : null;
    if (visible.length === 0 && !tail) list.append(emptyItem());
    if (tail) list.append(tail);
    if (visible.length > 0) fill(list, visible, tail);
    return list;
  }

  function emptyItem() {
    const empty = document.createElement("li");
    empty.className = "tree-empty";
    empty.setAttribute("role", "none");
    const glyph = document.createElement("span");
    glyph.className = "glyph";
    glyph.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = "Empty";
    const row = document.createElement("div");
    row.className = "tree-empty-row";
    row.append(chevronSpacer(), glyph, text);
    empty.append(row);
    return empty;
  }

  function wantsAddRow(parentId) {
    if (!editing || parentId === ROOT_ID) return false;
    // Section roots stay available when the in-folder add row is turned off.
    if (parentId === rootParentId) return true;
    return showAddRow();
  }

  function addRow(parentId) {
    const item = document.createElement("li");
    item.className = "tree-add";
    item.dataset.id = parentId;
    item.setAttribute("role", "none");
    const prompt = document.createElement("span");
    prompt.className = "tree-add-prompt";
    prompt.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = "Add";
    prompt.append(plusIcon(), label);
    item.append(
      prompt,
      addControl("folder", parentId, "Add Folder", folderPlusIcon),
      addControl("bookmark", parentId, "Add Bookmark", bookmarkPlusIcon),
    );
    return item;
  }

  function addControl(kind, parentId, label, icon) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tree-add-${kind}`;
    button.dataset.id = parentId;
    button.dataset.kind = kind;
    button.setAttribute("aria-label", label);
    const name = document.createElement("span");
    name.textContent = label;
    button.append(icon(), name);
    return button;
  }

  function fill(list, nodes, tail) {
    let index = 0;
    let alive = true;
    list._cancelFill = () => {
      alive = false;
    };
    const step = () => {
      if (!alive) return;
      if (index > 0 && !list.isConnected) return;
      const fragment = document.createDocumentFragment();
      const end = Math.min(index + CHUNK, nodes.length);
      for (; index < end; index += 1) fragment.append(renderItem(nodes[index]));
      list.insertBefore(fragment, tail);
      if (index < nodes.length) requestAnimationFrame(step);
      else ensureTabstop();
    };
    step();
  }

  function renderItem(node) {
    const item = document.createElement("li");
    item.className = "tree-node";
    item.setAttribute("role", "none");
    if (node.children) {
      if (editing && isHidden(node.id)) item.classList.add("is-concealed");
      item.append(renderFolder(node));
      if (isOpen(node.id)) item.append(buildList(node.children, node.id));
    } else {
      item.append(renderLink(node));
    }
    return item;
  }

  function renderFolder(node) {
    const title = node.pending ? "" : displayTitle(node);
    const row = document.createElement("div");
    row.className = "tree-row";
    row.role = "treeitem";
    row.tabIndex = -1;
    row.dataset.id = node.id;
    row.dataset.label = title;
    const concealed = editing && isHidden(node.id);
    row.title = concealed ? `${title} (hidden)` : title;
    row.setAttribute("aria-expanded", isOpen(node.id) ? "true" : "false");
    row.setAttribute("aria-label", concealed ? `${title}, hidden` : title);
    if (isPermanent(node.id)) row.dataset.fixed = "true";
    if (editing && !isPermanent(node.id) && !node.pending) row.draggable = true;
    row.append(chevronSlot(), folderSlot(), labelElement(title, getNeedles()));
    const actions = document.createElement("span");
    actions.className = "row-actions";
    if (!node.pending && editing) {
      actions.append(actionButton("add-item", `Add to ${title}`, node.id, plusIcon));
      if (!isPermanent(node.id)) actions.append(actionButton("edit-item", `Rename ${title}`, node.id, pencilIcon));
      actions.append(hideButton(node, title));
      if (!isPermanent(node.id)) actions.append(actionButton("delete-item", `Delete ${title}`, node.id, trashIcon));
    } else if (!node.pending && hasSubfolders(node)) {
      const branch = document.createElement("button");
      branch.type = "button";
      branch.className = "row-button branch-folder";
      branch.tabIndex = -1;
      branch.dataset.id = node.id;
      branch.addEventListener("mousedown", (event) => event.preventDefault());
      setBranchButton(branch, node, title);
      actions.append(branch);
    }
    const end = document.createElement("span");
    end.className = "row-end";
    end.append(actions);
    const counted = node.children.filter((child) => !child.pending);
    const visibleCount = (editing ? counted : counted.filter((child) => !isHidden(child.id))).length;
    if (visibleCount > 0) {
      const count = document.createElement("span");
      count.className = "count";
      count.setAttribute("aria-hidden", "true");
      count.textContent = String(visibleCount);
      end.append(count);
    }
    row.append(end);
    const folder = document.createElement("div");
    folder.className = "tree-folder";
    folder.append(row);
    return folder;
  }

  function renderLink(node) {
    const title = displayTitle(node);
    const needles = getNeedles();
    const anchor = document.createElement(editing ? "div" : "a");
    anchor.className = "tree-anchor";
    anchor.role = "treeitem";
    anchor.tabIndex = -1;
    anchor.dataset.id = node.id;
    anchor.dataset.label = title;
    anchor.title = node.url;
    anchor.setAttribute("aria-label", title);
    if (editing) anchor.draggable = true;
    else anchor.href = node.url;
    anchor.append(chevronSpacer(), faviconElement(node.url), labelElement(title, needles));
    const address = addressText(node.url, needles);
    if (address) {
      const host = document.createElement("span");
      host.className = "host";
      host.setAttribute("aria-hidden", "true");
      host.append(highlightText(address, needles));
      anchor.append(host);
    }
    if (editing) {
      const actions = document.createElement("span");
      actions.className = "row-actions";
      actions.append(
        actionButton("edit-item", `Edit ${title}`, node.id, pencilIcon),
        actionButton("delete-item", `Delete ${title}`, node.id, trashIcon),
      );
      const end = document.createElement("span");
      end.className = "row-end";
      end.append(actions);
      anchor.append(end);
    }
    return anchor;
  }

  function hideButton(node, title) {
    const concealed = isHidden(node.id);
    return actionButton("hide-folder", `${concealed ? "Show" : "Hide"} ${title}`, node.id, concealed ? eyeIcon : eyeOffIcon);
  }

  function actionButton(className, label, id, icon) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `row-button ${className}`;
    button.tabIndex = -1;
    button.dataset.id = id;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.append(icon());
    button.addEventListener("mousedown", (event) => event.preventDefault());
    return button;
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

  function ensureTabstop() {
    if (host.querySelector(`${ITEM}[tabindex="0"]`)) return;
    const first = host.querySelector(ITEM);
    if (first) first.tabIndex = 0;
  }

  function hasSubfolders(node) {
    return node.children.some((child) => child.children && !isHidden(child.id));
  }

  function setBranchButton(button, node, title = button.dataset.label || "") {
    const expand = !branchIsOpen(node);
    button.dataset.action = expand ? "expand" : "collapse";
    button.dataset.label = title;
    const label = `${expand ? "Expand" : "Collapse"} all in ${title}`;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.replaceChildren(expand ? expandAllIcon() : collapseAllIcon());
  }

  function branchIsOpen(node) {
    if (!isOpen(node.id)) return false;
    for (const child of node.children) {
      if (!child.children || isHidden(child.id)) continue;
      if (!branchIsOpen(child)) return false;
    }
    return true;
  }

  function syncBranchButtons(id) {
    let current = id;
    while (current) {
      const button = host.querySelector(`.branch-folder[data-id="${CSS.escape(current)}"]`);
      const node = byId.get(current);
      if (button && node?.children) setBranchButton(button, node, button.dataset.label || "");
      current = node?.parentId ?? "";
    }
  }

  function findItem(id) {
    return host.querySelector(`${ITEM}[data-id="${CSS.escape(id)}"]`);
  }

  function cancelFills() {
    for (const list of host.querySelectorAll(".tree-children")) list._cancelFill?.();
  }

  function neighborId(row, node) {
    const items = [...host.querySelectorAll(ITEM)];
    const index = items.indexOf(row);
    for (let cursor = index + 1; cursor < items.length; cursor += 1) {
      if (!node.contains(items[cursor])) return items[cursor].dataset.id;
    }
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (!node.contains(items[cursor])) return items[cursor].dataset.id;
    }
    return "";
  }

  attachTreeDrag(host, dragSession ?? createDragSession(), {
    isEditing,
    getNode: (id) => byId.get(id),
    getChildren: (id) => (id === rootParentId ? roots : byId.get(id)?.children) ?? null,
    onMove,
    onOpen(id) {
      if (!isOpen(id)) toggle(id);
    },
  });

  function takeFreshLabel() {
    const edit = labelEdit;
    if (!edit?.fresh || !edit.input.isConnected) return null;
    const value = edit.input.value.trim();
    const id = edit.id;
    edit.finish(true, true);
    return { id, value };
  }

  return { setTree, showMessage, toggle, syncOpen, focus, focusNeighbor, editFolderLabel, finishLabel, labelDraft, takeFreshLabel };
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
    if (!needle) continue;
    let index = lower.indexOf(needle);
    while (index !== -1) {
      ranges.push([index, index + needle.length]);
      index = lower.indexOf(needle, index + needle.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
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
  const active = needles.filter(Boolean);
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

function displayTitle(node) {
  const title = node.title.trim();
  if (title) return title;
  if (node.url) return hostname(node.url) || node.url;
  return "Untitled folder";
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
