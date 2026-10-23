const ITEM = '[role="treeitem"]';

export function createDragSession() {
  const session = {
    dragId: "",
    folder: false,
    drop: null,
    hosts: new Set(),
    openTimer: 0,
    armId: "",
    clearing: false,
    pendingSection: "",
    onFolderDrag() {},
    onPendingSection() {},
    clearMark() {
      session.drop?.row.classList.remove("is-drop-before", "is-drop-after", "is-drop-inside");
      session.drop = null;
    },
  };
  return session;
}

export function attachTreeDrag(host, session, { isEditing, getNode, getChildren, onMove, onOpen }) {
  session.hosts.add(host);

  host.addEventListener("dragstart", onStart);
  host.addEventListener("dragover", onOver);
  host.addEventListener("drop", onDrop);
  host.addEventListener("dragend", finish);

  function onStart(event) {
    if (!isEditing()) return;
    if (event.target.closest?.("button, a, input, textarea")) {
      event.preventDefault();
      return;
    }
    const row = event.target.closest?.(ITEM);
    if (!row || !host.contains(row) || row.dataset.fixed === "true" || !row.draggable) {
      event.preventDefault();
      return;
    }
    const node = getNode(row.dataset.id);
    session.pendingSection = "";
    session.dragId = row.dataset.id;
    session.folder = Boolean(node?.children);
    for (const item of session.hosts) item.classList.add("is-moving");
    host.getBoundingClientRect();
    row.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = session.folder ? "copyMove" : "move";
    event.dataTransfer.setData("text/plain", session.dragId);
    session.onFolderDrag(session.folder ? session.dragId : "");
  }

  function onOver(event) {
    if (!session.dragId) return;
    const next = resolve(event);
    if (!next) {
      session.clearMark();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    mark(next);
    armOpen(next);
  }

  function onDrop(event) {
    if (!session.dragId) return;
    event.preventDefault();
    const next = session.drop;
    const id = session.dragId;
    finish();
    if (next) onMove(id, { parentId: next.parentId, beforeId: next.beforeId });
  }

  function finish() {
    const id = session.dragId;
    if (id) {
      for (const item of session.hosts) {
        for (const row of item.querySelectorAll(`${ITEM}[data-id="${CSS.escape(id)}"]`)) {
          row.classList.remove("is-dragging");
        }
      }
    }
    const active = Boolean(session.dragId);
    const pendingSection = session.pendingSection;
    session.pendingSection = "";
    session.dragId = "";
    session.folder = false;
    session.clearMark();
    window.clearTimeout(session.openTimer);
    session.armId = "";
    delete document.documentElement.dataset.dragging;
    if (active) session.onFolderDrag("");
    clearStuckHover();
    if (pendingSection) window.setTimeout(() => session.onPendingSection(pendingSection), 0);
  }

  // Chromium leaves :hover on rows the pointer crossed, so the action buttons stay visible after a drop.
  function clearStuckHover() {
    if (session.clearing) return;
    const moving = [...session.hosts].some((item) => item.classList.contains("is-moving"));
    if (!moving) return;
    session.clearing = true;
    for (const item of session.hosts) item.style.pointerEvents = "none";
    requestAnimationFrame(() => {
      for (const item of session.hosts) item.style.pointerEvents = "";
      requestAnimationFrame(() => {
        for (const item of session.hosts) item.classList.remove("is-moving");
        session.clearing = false;
      });
    });
  }

  function resolve(event) {
    const add = event.target.closest?.(".tree-add");
    if (add && host.contains(add)) return accept(add.dataset.id, null, "inside", add);
    const empty = event.target.closest?.(".tree-empty");
    if (empty && host.contains(empty)) {
      const row = empty.closest(".tree-node")?.querySelector(":scope > .tree-folder > [role='treeitem']");
      if (!row) return null;
      return accept(row.dataset.id, null, "inside", row);
    }
    const row = event.target.closest?.(ITEM);
    if (!row || !host.contains(row)) return null;
    const node = getNode(row.dataset.id);
    if (!node || node.pending) return null;
    const zone = zoneFor(row, event, node);
    if (!zone) return null;
    if (zone === "inside") return accept(node.id, null, "inside", row);
    if (!node.parentId) return null;
    const children = getChildren(node.parentId);
    if (!children) return null;
    if (zone === "before") return accept(node.parentId, node.id, "before", row);
    const index = children.findIndex((child) => child.id === node.id);
    const next = children[index + 1];
    return accept(node.parentId, next?.id ?? null, "after", row);
  }

  function accept(parentId, beforeId, zone, row) {
    if (!parentId || insideDragged(parentId) || sameSpot(parentId, beforeId)) return null;
    return { parentId, beforeId, zone, row };
  }

  function insideDragged(parentId) {
    let current = getNode(parentId);
    while (current) {
      if (current.id === session.dragId) return true;
      current = current.parentId ? getNode(current.parentId) : null;
    }
    return false;
  }

  function sameSpot(parentId, beforeId) {
    const node = getNode(session.dragId);
    if (!node || node.parentId !== parentId) return false;
    const children = getChildren(parentId);
    const oldIndex = children?.findIndex((child) => child.id === session.dragId) ?? -1;
    if (oldIndex < 0) return false;
    const index = beforeId ? children.findIndex((child) => child.id === beforeId) : children.length;
    return index === oldIndex || index === oldIndex + 1;
  }

  function zoneFor(row, event, node) {
    const rect = row.getBoundingClientRect();
    if (rect.height === 0) return null;
    const ratio = (event.clientY - rect.top) / rect.height;
    const folder = row.hasAttribute("aria-expanded");
    const root = row.dataset.fixed === "true" || !node.parentId;
    if (root) return ratio > 0.18 && ratio < 0.82 ? "inside" : null;
    if (!folder) return ratio < 0.5 ? "before" : "after";
    if (ratio < 0.28) return "before";
    if (ratio > 0.72) return "after";
    return "inside";
  }

  function mark(next) {
    if (session.drop?.row === next.row && session.drop.zone === next.zone) {
      session.drop = next;
      return;
    }
    session.clearMark();
    session.drop = next;
    next.row.classList.add(next.zone === "inside" ? "is-drop-inside" : next.zone === "before" ? "is-drop-before" : "is-drop-after");
  }

  function armOpen(next) {
    if (next.zone !== "inside" || next.row.getAttribute("aria-expanded") !== "false") {
      window.clearTimeout(session.openTimer);
      session.armId = "";
      return;
    }
    if (session.armId === next.parentId) return;
    window.clearTimeout(session.openTimer);
    session.armId = next.parentId;
    const parentId = next.parentId;
    session.openTimer = window.setTimeout(() => {
      if (session.dragId && session.armId === parentId) onOpen(parentId);
    }, 650);
  }
}
