const ROW = ".tree-row, .tree-anchor, .tree-add, .graph-folder, .graph-leaf, .section-toggle";
const CONTROL = ".row-button, .tree-add button, .section-remove, .branch-folder, .branch-toggle, .graph-toggle";

// Chromium leaves :hover on the element under the pointer when a scroll
// starts. .is-hot follows the pointer instead, including while the page moves.
export function attachScrollHover() {
  let x = 0;
  let y = 0;
  let inside = false;
  let frame = 0;
  let followUp = false;
  let hot = new Set();

  document.addEventListener("pointermove", (event) => {
    if (document.documentElement.dataset.dragging === "on") return;
    x = event.clientX;
    y = event.clientY;
    inside = true;
    schedule();
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => {
    inside = false;
    clear();
  });
  document.addEventListener("pointerout", (event) => {
    // Swapping the icon under the pointer has no related target, same as
    // leaving the window. Keep the last real coordinates and look again.
    if (event.relatedTarget || !inside) return;
    schedule();
  }, true);
  document.addEventListener("click", () => {
    if (!inside || document.documentElement.dataset.dragging === "on") return;
    // Capture runs before a graph click can stop the event. The map also
    // moves again on the next frame, so check the pointer once more after that.
    schedule(true);
  }, true);
  document.addEventListener("dragstart", () => {
    inside = false;
    clear();
  }, true);
  document.addEventListener("scroll", () => {
    if (!inside || document.documentElement.dataset.dragging === "on") return;
    schedule();
  }, { capture: true, passive: true });

  function schedule(follow) {
    if (follow) followUp = true;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      sync();
      if (!followUp) return;
      followUp = false;
      schedule();
    });
  }

  function sync() {
    frame = 0;
    if (!inside || document.documentElement.dataset.dragging === "on") {
      clear();
      return;
    }
    document.documentElement.dataset.pointer = "on";
    // The action button is hidden until the row is hot. Mark the row first,
    // then hit-test again so the button now under the pointer is included.
    apply(collect(document.elementFromPoint(x, y)));
    const revealed = collect(document.elementFromPoint(x, y));
    if (revealed.size) apply(revealed);
  }

  function collect(hit) {
    const next = new Set();
    if (!(hit instanceof Element)) return next;
    const row = hit.closest(ROW);
    const control = hit.closest(CONTROL);
    if (row) next.add(row);
    if (control) next.add(control);
    return next;
  }

  function apply(next) {
    for (const element of hot) {
      if (!next.has(element)) element.classList.remove("is-hot");
    }
    for (const element of next) {
      if (!hot.has(element)) element.classList.add("is-hot");
    }
    hot = next;
  }

  function clear() {
    delete document.documentElement.dataset.pointer;
    for (const element of hot) element.classList.remove("is-hot");
    hot = new Set();
  }
}
