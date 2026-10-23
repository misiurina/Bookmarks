const EDGE = 48;
const MIN_SPEED = 1;
const MAX_SPEED = 16;

const watchers = new Set();

// Chromium autoscrolls only the box under the pointer. Bookmark rows don't
// scroll, so a drag can't reach anything outside the current view unless a
// parent scroller is moved from here.
export function attachEdgeScroll() {
  let x = 0;
  let y = 0;
  let frame = 0;
  let last = 0;
  let dragging = false;
  let tracked = false;

  document.addEventListener("dragover", onDragOver, true);
  document.addEventListener("dragend", onDragEnd, true);
  document.addEventListener("pointermove", onPointerMove, true);

  function onDragOver(event) {
    if (event.edgeScroll || document.documentElement.dataset.editing !== "on") return;
    dragging = true;
    tracked = true;
    document.documentElement.dataset.dragging = "on";
    x = event.clientX;
    y = event.clientY;
    schedule();
  }

  function onDragEnd() {
    dragging = false;
    delete document.documentElement.dataset.dragging;
    if (document.documentElement.dataset.sectionReorder !== "on") tracked = false;
  }

  function onPointerMove(event) {
    if (document.documentElement.dataset.sectionReorder !== "on") return;
    tracked = true;
    x = event.clientX;
    y = event.clientY;
    schedule();
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(tick);
  }

  function tick(now) {
    frame = 0;
    const reorder = document.documentElement.dataset.sectionReorder === "on";
    if (!dragging && !reorder) {
      last = 0;
      return;
    }
    const scale = (last ? Math.min(32, now - last) : 16.67) / 16.67;
    last = now;
    if (tracked && scrollAt(x, y, scale)) {
      if (dragging) replayDrag(x, y);
      if (reorder) {
        for (const watcher of watchers) watcher(x, y);
      }
    }
    schedule();
  }
}

export function watchEdgeScroll(listener) {
  watchers.add(listener);
  return () => watchers.delete(listener);
}

function replayDrag(x, y) {
  const hit = document.elementFromPoint(x, y);
  if (!(hit instanceof Element)) return;
  const event = new DragEvent("dragover", {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  event.edgeScroll = true;
  hit.dispatchEvent(event);
}

function scrollAt(x, y, scale) {
  for (const scroller of scrollersAt(x, y)) {
    const band = scroller === document.scrollingElement
      ? { top: 0, bottom: window.innerHeight }
      : verticalBand(scroller);
    const dy = step(y, band.top, band.bottom) * scale;
    if (!dy || !canMove(scroller, dy)) continue;
    const before = scroller.scrollTop;
    scroller.scrollBy(0, dy);
    if (scroller.scrollTop !== before) return true;
  }
  return false;
}

function scrollersAt(x, y) {
  const found = [];
  let node = document.elementFromPoint(x, y);
  while (node instanceof Element) {
    if (canScroll(node)) found.push(node);
    if (node === document.documentElement) break;
    node = node.parentElement;
  }
  const root = document.scrollingElement;
  if (root && !found.includes(root)) found.push(root);
  return found;
}

function canScroll(node) {
  if (node.closest(".settings-drawer")) return false;
  if (node === document.scrollingElement) return node.scrollHeight > node.clientHeight + 1;
  const overflow = getComputedStyle(node).overflowY;
  if (overflow !== "auto" && overflow !== "scroll" && overflow !== "overlay") return false;
  return node.scrollHeight > node.clientHeight + 1;
}

function verticalBand(node) {
  const rect = node.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom };
}

function canMove(scroller, dy) {
  if (dy < 0) return scroller.scrollTop > 0;
  return scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1;
}

function step(pointer, start, end) {
  if (pointer < start + EDGE) return -speed(start + EDGE - pointer);
  if (pointer > end - EDGE) return speed(pointer - (end - EDGE));
  return 0;
}

function speed(distance) {
  const t = Math.min(1, Math.max(0, distance) / EDGE);
  return MIN_SPEED + (MAX_SPEED - MIN_SPEED) * t * t;
}
