const ITEM = '[role="treeitem"]';

export function attachTreeKeyboard(host, { onToggle, onEdit, onDelete, isEditing }) {
  let buffer = "";
  let bufferAt = 0;

  host.addEventListener("focusin", (event) => {
    const item = event.target.closest?.(ITEM);
    if (!item || !host.contains(item)) return;
    for (const entry of host.querySelectorAll(`${ITEM}[tabindex="0"]`)) {
      if (entry !== item) entry.tabIndex = -1;
    }
    item.tabIndex = 0;
  });

  host.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const current = event.target.closest?.(ITEM);
    if (!current || !host.contains(current)) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(host, current, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(host, current, -1);
        break;
      case "ArrowRight":
        event.preventDefault();
        openOrEnter(current, onToggle);
        break;
      case "ArrowLeft":
        event.preventDefault();
        closeOrExit(host, current, onToggle);
        break;
      case "Home":
        event.preventDefault();
        focusItem(host.querySelector(ITEM));
        break;
      case "End": {
        event.preventDefault();
        const all = host.querySelectorAll(ITEM);
        focusItem(all[all.length - 1]);
        break;
      }
      case "Enter":
        if (!current.hasAttribute("aria-expanded")) return;
        event.preventDefault();
        onToggle(current.dataset.id);
        break;
      case "Delete":
        if (!isEditing?.() || current.dataset.fixed === "true") return;
        event.preventDefault();
        onDelete?.(current.dataset.id);
        break;
      case "F2":
        if (!isEditing?.() || current.dataset.fixed === "true") return;
        event.preventDefault();
        onEdit?.(current.dataset.id, current);
        break;
      case " ":
        event.preventDefault();
        if (current.hasAttribute("aria-expanded")) onToggle(current.dataset.id);
        else current.click();
        break;
      default:
        typeAhead(host, current, event);
        break;
    }
  });

  function typeAhead(tree, current, event) {
    if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    const now = performance.now();
    if (now - bufferAt > 500) buffer = "";
    bufferAt = now;
    buffer += event.key.toLowerCase();
    const all = [...tree.querySelectorAll(ITEM)];
    const start = all.indexOf(current);
    const ordered = all.slice(start + 1).concat(all.slice(0, start + 1));
    const match = ordered.find((item) => (item.dataset.label || "").toLowerCase().startsWith(buffer));
    if (match) focusItem(match);
  }
}

function move(host, current, direction) {
  const all = [...host.querySelectorAll(ITEM)];
  const next = all[all.indexOf(current) + direction];
  focusItem(next);
}

function openOrEnter(current, onToggle) {
  const state = current.getAttribute("aria-expanded");
  if (state === "false") onToggle(current.dataset.id);
  else if (state === "true") {
    focusItem(current.closest(".tree-node")?.querySelector(":scope > .tree-children [role='treeitem']"));
  }
}

function closeOrExit(host, current, onToggle) {
  if (current.getAttribute("aria-expanded") === "true") {
    onToggle(current.dataset.id);
    return;
  }
  const group = current.closest(".tree-children");
  if (!group || group.parentElement === host) return;
  focusItem(group.parentElement?.querySelector("[role='treeitem']"));
}

function focusItem(item) {
  if (!item) return;
  item.focus({ preventScroll: true });
  item.scrollIntoView({ block: "nearest" });
}
