import { watchEdgeScroll } from "../ui/autoscroll.js";

const THRESHOLD = 6;

// Section order is a pointer gesture. It never joins the bookmark drag, and a
// section can only land before or after another section.
export function attachSectionReorder({ rail, railList, sectionsMount, isEditing, isBlocked, sectionIds, onReorder }) {
  let tracking = null;
  let suppressClick = false;
  let ghost = null;

  rail.addEventListener("dragstart", (event) => {
    if (event.target.closest(".section-rail-item")) event.preventDefault();
  }, true);
  sectionsMount.addEventListener("dragstart", (event) => {
    if (event.target.closest(".header")) event.preventDefault();
  }, true);
  rail.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".section-remove")) return;
    const button = event.target.closest(".section-toggle");
    if (!button || !rail.contains(button)) return;
    begin(event, button.dataset.sectionId);
  });
  sectionsMount.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".tree-host, button, a, input, textarea")) return;
    const header = event.target.closest(".header");
    if (!header || !sectionsMount.contains(header)) return;
    begin(event, header.dataset.sectionId);
  });
  rail.addEventListener("click", (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (!tracking?.active || event.key !== "Escape") return;
    event.preventDefault();
    finish(true);
  });
  watchEdgeScroll((x, y) => {
    if (!tracking?.active) return;
    tracking.slot = slotAt(x, y, tracking.id);
    paintSlot(tracking.slot);
  });

  function begin(event, id) {
    if (!isEditing() || event.button !== 0 || tracking || isBlocked() || !id) return;
    tracking = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false, slot: null };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function onMove(event) {
    if (!tracking || event.pointerId !== tracking.pointerId) return;
    if (!isEditing()) {
      finish(false);
      return;
    }
    if (!tracking.active) {
      const dx = event.clientX - tracking.x;
      const dy = event.clientY - tracking.y;
      if (dx * dx + dy * dy < THRESHOLD * THRESHOLD) return;
      tracking.active = true;
      document.documentElement.dataset.sectionReorder = "on";
      for (const element of sources(tracking.id)) element.classList.add("is-reordering");
      showGhost(tracking.id, event.clientX, event.clientY);
    }
    event.preventDefault();
    placeGhost(event.clientX, event.clientY);
    tracking.slot = slotAt(event.clientX, event.clientY, tracking.id);
    paintSlot(tracking.slot);
  }

  function onUp(event) {
    if (!tracking || event.pointerId !== tracking.pointerId) return;
    const { id, active, slot } = tracking;
    finish(active);
    if (active && slot) onReorder(id, slot.beforeId);
  }

  function finish(dragged) {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    delete document.documentElement.dataset.sectionReorder;
    for (const element of document.querySelectorAll(".is-reordering")) element.classList.remove("is-reordering");
    clearMarks();
    ghost?.remove();
    ghost = null;
    tracking = null;
    if (!dragged) return;
    suppressClick = true;
    window.setTimeout(() => {
      suppressClick = false;
    }, 0);
  }

  function showGhost(id, x, y) {
    ghost = document.createElement("div");
    ghost.className = "section-reorder-ghost";
    ghost.textContent = labelFor(id);
    document.body.append(ghost);
    placeGhost(x, y);
  }

  function placeGhost(x, y) {
    if (!ghost) return;
    const left = Math.min(Math.max(8, x + 14), window.innerWidth - ghost.offsetWidth - 8);
    const top = Math.min(Math.max(8, y + 16), window.innerHeight - ghost.offsetHeight - 8);
    ghost.style.left = `${left}px`;
    ghost.style.top = `${top}px`;
  }

  function slotAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    if (hit?.closest(".tree-host, .section-new")) return null;
    const railItem = hit?.closest(".section-rail-item");
    if (railItem && railList.contains(railItem)) {
      return slotFor(railItem.dataset.sectionId, y, railItem.getBoundingClientRect());
    }
    const railBox = railList.getBoundingClientRect();
    if (x >= railBox.left && x <= railBox.right && y >= railBox.top && y <= railBox.bottom) {
      return slotFromList([...railList.querySelectorAll(".section-rail-item")], y);
    }
    return slotFromGaps(x, y);
  }

  function slotFor(id, y, rect) {
    if (!id) return null;
    const ids = sectionIds();
    const index = ids.indexOf(id);
    if (index < 0) return null;
    const after = y > rect.top + rect.height / 2;
    return { beforeId: after ? ids[index + 1] ?? null : id };
  }

  function slotFromList(items, y) {
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return { beforeId: item.dataset.sectionId };
    }
    return items.length ? { beforeId: null } : null;
  }

  function slotFromGaps(x, y) {
    const mount = sectionsMount.getBoundingClientRect();
    if (x < mount.left || x > mount.right || y < mount.top || y > mount.bottom) return null;
    const panels = [...sectionsMount.querySelectorAll(":scope > .panel:not([hidden])")];
    for (let index = 0; index < panels.length; index += 1) {
      const panel = panels[index];
      const rect = panel.getBoundingClientRect();
      const header = panel.querySelector(".header")?.getBoundingClientRect();
      const top = header?.top ?? rect.top;
      const next = panels[index + 1];
      const nextTop = next ? next.getBoundingClientRect().top : rect.bottom + 48;
      if (y >= top - 28 && y < top) return { beforeId: panel.dataset.sectionId };
      if (header && y >= header.top && y <= header.bottom) return slotFor(panel.dataset.sectionId, y, header);
      if (header && y > header.bottom && y < rect.bottom) return null;
      if (y >= rect.bottom && y < nextTop) return { beforeId: next?.dataset.sectionId ?? null };
    }
    return null;
  }

  function paintSlot(slot) {
    clearMarks();
    if (!slot) return;
    const ids = sectionIds();
    const markId = slot.beforeId ?? ids[ids.length - 1];
    if (!markId) return;
    const place = slot.beforeId ? "is-section-before" : "is-section-after";
    railList.querySelector(`.section-rail-item[data-section-id="${CSS.escape(markId)}"]`)?.classList.add(place);
  }

  function clearMarks() {
    for (const element of document.querySelectorAll(".is-section-before, .is-section-after")) {
      element.classList.remove("is-section-before", "is-section-after");
    }
  }

  function sources(id) {
    return [
      railList.querySelector(`.section-rail-item[data-section-id="${CSS.escape(id)}"]`),
      sectionsMount.querySelector(`:scope > .panel[data-section-id="${CSS.escape(id)}"]`),
    ].filter(Boolean);
  }

  function labelFor(id) {
    return railList.querySelector(`.section-toggle[data-section-id="${CSS.escape(id)}"] .section-toggle-label`)?.textContent
      || sectionsMount.querySelector(`:scope > .panel[data-section-id="${CSS.escape(id)}"] .section-title`)?.textContent
      || "Section";
  }
}
