import { collapseAllIcon, expandAllIcon, globeSvg } from "../ui/icons.js";

const BEND = 10;
const EDGE = 24;
// The hover button sits 7px from the edge and is 22px wide. Names only grow
// their right padding when the free space is smaller than this.
const NAME_CLEARANCE = 35;
const MIDDLE_CLEAR = 4;

// Left-to-right map. Folders and bookmarks stay in document order; the lines
// are measured from the laid-out nodes so a parent meets the vertical spine
// of its children with rounded elbows.
export function createGraphView(host, {
  faviconFor,
  isOpen,
  isHidden,
  onToggle,
  onBranch,
  getNeedles,
  doubleClickBranch = () => false,
  recenter = () => false,
}) {
  let roots = [];
  let sectionRoot = null;
  let mode = "empty";
  let centerRequest = false;
  let branchGesture = null;
  let frame = 0;
  let scrollEl = null;
  let gutterLeft = null;
  let gutterRight = null;
  let canvasEl = null;

  const page = host.closest(".page");
  const observer = new ResizeObserver(() => scheduleDraw());
  if (page) observer.observe(page);
  observer.observe(host);
  window.addEventListener("resize", () => scheduleDraw());

  host.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    const node = event.target.closest?.(".graph-node");
    if (!node || !host.contains(node)) return;
    event.preventDefault();
  });

  host.addEventListener("click", (event) => {
    const branchButton = event.target.closest?.(".branch-folder");
    if (branchButton && host.contains(branchButton)) {
      event.preventDefault();
      event.stopPropagation();
      onBranch(branchButton.dataset.id, branchButton.dataset.action === "expand");
      reveal(branchButton.dataset.id);
      return;
    }
    const node = event.target.closest?.(".graph-folder");
    if (!node || !host.contains(node) || node.hasAttribute("data-section-root") || !node.hasAttribute("aria-expanded")) return;
    const id = node.dataset.id;
    if (event.detail > 1 && doubleClickBranch() && branchGesture?.id === id) {
      const expand = branchGesture.expand;
      branchGesture = null;
      onBranch(id, expand);
      reveal(id);
      return;
    }
    if (doubleClickBranch()) branchGesture = { id, expand: !branchOpen(id) };
    else branchGesture = null;
    onToggle(id, node.getAttribute("aria-expanded") !== "true");
    reveal(id);
  });

  host.addEventListener("keydown", onKeyDown);

  host.addEventListener("focusin", (event) => {
    const node = event.target.closest?.(".graph-node");
    if (!node || !host.contains(node)) return;
    for (const item of host.querySelectorAll(".graph-node[tabindex='0']")) {
      if (item !== node) item.tabIndex = -1;
    }
    node.tabIndex = 0;
  });

  host.addEventListener("error", (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.classList.contains("graph-favicon-img")) return;
    image.replaceWith(globeSvg());
  }, true);

  function setTree(nextRoots, nextSection, center = false) {
    roots = nextRoots;
    sectionRoot = nextSection;
    mode = "tree";
    if (center) centerRequest = true;
    render();
  }

  function showMessage(text) {
    mode = "message";
    cancelDraw();
    scrollEl = null;
    canvasEl = null;
    const message = document.createElement("p");
    message.className = "graph-message";
    message.textContent = text;
    host.replaceChildren(message);
  }

  function clear() {
    mode = "empty";
    roots = [];
    sectionRoot = null;
    cancelDraw();
    scrollEl = null;
    canvasEl = null;
    gutterLeft = null;
    gutterRight = null;
    host.replaceChildren();
  }

  function sync(center = false) {
    if (mode !== "tree") return;
    if (center) centerRequest = true;
    render();
  }

  function focus(id) {
    const node = findNode(id);
    if (!node) return false;
    for (const item of host.querySelectorAll(".graph-node[tabindex='0']")) {
      if (item !== node) item.tabIndex = -1;
    }
    node.tabIndex = 0;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }

  function destroy() {
    cancelDraw();
    observer.disconnect();
  }

  function render() {
    const keepScroll = host.querySelector(".graph-scroll")?.scrollLeft ?? 0;
    const restoreId = focusedId();
    const scroll = document.createElement("div");
    scroll.className = "graph-scroll";
    const track = document.createElement("div");
    track.className = "graph-track";
    const left = document.createElement("div");
    left.className = "graph-gutter";
    left.setAttribute("aria-hidden", "true");
    const right = document.createElement("div");
    right.className = "graph-gutter";
    right.setAttribute("aria-hidden", "true");
    const canvas = document.createElement("div");
    canvas.className = "graph-canvas";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "graph-lines");
    svg.setAttribute("aria-hidden", "true");
    canvas.append(svg, renderSection());
    track.append(left, canvas, right);
    scroll.append(track);
    scrollEl = scroll;
    gutterLeft = left;
    gutterRight = right;
    canvasEl = canvas;
    const pageX = window.scrollX;
    const pageY = window.scrollY;
    host.replaceChildren(scroll);
    if (window.scrollX !== pageX || window.scrollY !== pageY) window.scrollTo(pageX, pageY);
    const first = host.querySelector(".graph-node");
    if (first) first.tabIndex = 0;
    if (restoreId) focus(restoreId);
    const shouldCenter = centerRequest;
    centerRequest = false;
    settleScroll(shouldCenter, keepScroll);
    scheduleDraw();
  }

  function renderSection() {
    const visible = roots.filter((node) => !isHidden(node.id));
    const list = document.createElement("ul");
    list.className = "graph-children is-section";
    list.setAttribute("role", "group");
    const branch = document.createElement("li");
    branch.className = "graph-branch";
    branch.setAttribute("role", "none");
    branch.append(renderSectionNode(visible.length > 0));
    const joint = renderJoint(visible, 1);
    if (joint) branch.append(joint);
    list.append(branch);
    return list;
  }

  function renderSectionNode(expanded) {
    const title = sectionRoot?.title?.trim() || "Untitled folder";
    const el = document.createElement("div");
    el.className = "graph-node graph-folder is-first";
    el.dataset.id = sectionRoot?.id || "";
    el.dataset.label = title;
    el.dataset.sectionRoot = "true";
    el.title = title;
    el.setAttribute("role", "treeitem");
    el.tabIndex = -1;
    el.setAttribute("aria-level", "1");
    if (expanded) el.setAttribute("aria-expanded", "true");
    const label = document.createElement("span");
    label.className = "graph-label";
    label.append(highlightText(title, getNeedles()));
    el.append(label);
    return el;
  }

  function renderJoint(nodes, depth) {
    if (nodes.length === 0) return null;
    const joint = document.createElement("div");
    joint.className = "graph-joint";
    const stem = document.createElement("div");
    stem.className = "graph-stem";
    stem.setAttribute("aria-hidden", "true");
    const list = document.createElement("ul");
    list.className = "graph-children";
    list.setAttribute("role", "group");
    for (const node of nodes) list.append(renderBranch(node, depth));
    joint.append(stem, list);
    return joint;
  }

  function renderBranch(node, depth) {
    const branch = document.createElement("li");
    branch.className = "graph-branch";
    branch.setAttribute("role", "none");
    branch.append(renderNode(node, depth));
    const children = shownChildren(node);
    if (children.length > 0 && isOpen(node.id)) {
      const joint = renderJoint(children, depth + 1);
      if (joint) branch.append(joint);
    }
    return branch;
  }

  function renderNode(node, depth) {
    const folder = Boolean(node.children);
    const title = displayTitle(node);
    const children = folder ? shownChildren(node) : [];
    const el = document.createElement(folder ? "div" : "a");
    el.className = folder
      ? `graph-node graph-folder${depth === 0 ? " is-first" : " is-uniform"}`
      : "graph-node graph-leaf";
    el.dataset.id = node.id;
    el.dataset.label = title;
    el.title = folder ? title : (node.url || title);
    el.setAttribute("role", "treeitem");
    el.tabIndex = -1;
    el.setAttribute("aria-level", String(depth + 1));
    if (folder) {
      if (children.length > 0) el.setAttribute("aria-expanded", isOpen(node.id) ? "true" : "false");
    } else if (node.url) el.href = node.url;
    if (!folder) el.append(faviconElement(node.url));
    const label = document.createElement("span");
    label.className = "graph-label";
    label.append(highlightText(title, getNeedles()));
    el.append(label);
    if (folder && children.some((child) => child.children)) el.append(branchButton(node, title));
    return el;
  }

  function branchButton(node, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "row-button branch-folder";
    button.tabIndex = -1;
    button.dataset.id = node.id;
    const expand = !branchOpen(node.id);
    button.dataset.action = expand ? "expand" : "collapse";
    const label = `${expand ? "Expand" : "Collapse"} all in ${title}`;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.append(expand ? expandAllIcon() : collapseAllIcon());
    return button;
  }

  function shownChildren(node) {
    if (!node?.children) return [];
    return node.children.filter((child) => !isHidden(child.id));
  }

  function branchOpen(id) {
    const node = findModel(id);
    if (!node?.children || !isOpen(id)) return false;
    for (const child of shownChildren(node)) {
      if (child.children && !branchOpen(child.id)) return false;
    }
    return true;
  }

  function findModel(id) {
    let found = null;
    const walk = (nodes) => {
      for (const node of nodes) {
        if (node.id === id) {
          found = node;
          return;
        }
        if (node.children) walk(node.children);
        if (found) return;
      }
    };
    walk(roots);
    return found;
  }

  function faviconElement(url) {
    const slot = document.createElement("span");
    slot.className = "graph-favicon";
    slot.setAttribute("aria-hidden", "true");
    const src = faviconFor(url);
    if (!src) {
      slot.append(globeSvg());
      return slot;
    }
    const image = document.createElement("img");
    image.className = "graph-favicon-img";
    image.alt = "";
    image.width = 14;
    image.height = 14;
    image.decoding = "async";
    image.draggable = false;
    image.src = src;
    slot.append(image);
    return slot;
  }

  function scheduleDraw() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (mode !== "tree" || !scrollEl?.isConnected) return;
      settleScroll(false, scrollEl.scrollLeft);
    });
  }

  function cancelDraw() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function syncFrame() {
    if (!scrollEl?.isConnected || !gutterLeft || !gutterRight) return;
    const viewWidth = document.documentElement.clientWidth;
    const left = Math.max(0, host.getBoundingClientRect().left);
    const pageX = window.scrollX;
    const pageY = window.scrollY;
    writeStyle(scrollEl, "width", `${viewWidth}px`);
    writeStyle(scrollEl, "marginLeft", `${-left}px`);
    if (window.scrollX !== pageX || window.scrollY !== pageY) window.scrollTo(pageX, pageY);
  }

  function settleScroll(center, keepScroll) {
    if (!scrollEl?.isConnected || !canvasEl) return;
    const pageX = window.scrollX;
    const pageY = window.scrollY;
    syncFrame();
    drawLines();
    const fits = recenter() ? layoutCompact() : layoutAligned();
    scrollEl.style.overflowX = fits ? "hidden" : "auto";
    if (fits) scrollEl.scrollLeft = 0;
    else if (center) centerInView();
    else scrollEl.scrollLeft = keepScroll;
    if (window.scrollX !== pageX || window.scrollY !== pageY) window.scrollTo(pageX, pageY);
  }

  // Wide side space, so a scrolled map can line up with the other sections.
  function layoutAligned() {
    const viewWidth = scrollEl.clientWidth;
    const box = host.getBoundingClientRect();
    writeStyle(gutterLeft, "width", `${Math.max(0, box.left)}px`);
    writeStyle(gutterRight, "width", `${Math.max(0, viewWidth - box.right)}px`);
    return scrollEl.scrollWidth - scrollEl.clientWidth <= 1;
  }

  // Tight margin. A map that fits stays centered and does not scroll.
  function layoutCompact() {
    const viewWidth = scrollEl.clientWidth;
    const canvasWidth = canvasEl.getBoundingClientRect().width;
    if (canvasWidth + EDGE * 2 > viewWidth + 1) {
      writeStyle(gutterLeft, "width", `${EDGE}px`);
      writeStyle(gutterRight, "width", `${EDGE}px`);
      return false;
    }
    const side = Math.max(EDGE, (viewWidth - canvasWidth) / 2);
    writeStyle(gutterLeft, "width", `${side}px`);
    writeStyle(gutterRight, "width", `${side}px`);
    return true;
  }

  function centerInView() {
    const max = scrollEl.scrollWidth - scrollEl.clientWidth;
    if (max <= 1) {
      scrollEl.scrollLeft = 0;
      return;
    }
    const canvas = canvasEl.getBoundingClientRect();
    const port = scrollEl.getBoundingClientRect();
    const center = scrollEl.scrollLeft + (canvas.left - port.left) + canvas.width / 2;
    const next = center - scrollEl.clientWidth / 2;
    scrollEl.scrollLeft = Math.max(0, Math.min(max, next));
  }

  function drawLines() {
    const canvas = canvasEl;
    const svg = canvas?.querySelector(".graph-lines");
    if (!canvas?.isConnected || !svg) return;
    clearFolderNames(canvas);
    balanceJoints(canvas);
    const origin = canvas.getBoundingClientRect();
    if (origin.width < 1 || origin.height < 1) return;
    svg.setAttribute("viewBox", `0 0 ${px(origin.width)} ${px(origin.height)}`);
    svg.setAttribute("width", String(origin.width));
    svg.setAttribute("height", String(origin.height));
    const paths = [];
    for (const joint of canvas.querySelectorAll(".graph-joint")) {
      const d = connectorPath(joint, origin);
      if (d) paths.push(d);
    }
    svg.replaceChildren();
    for (const d of paths) {
      for (const part of d) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", part);
        svg.append(path);
      }
    }
    clipBalancedSlack();
  }

  // Balancing pads a joint so the parent sits on the midpoint of its children.
  // That pad is empty. Drop it from the section's height once the lines are drawn.
  function clipBalancedSlack() {
    canvasEl.style.transform = "";
    scrollEl.style.height = "";
    const nodes = canvasEl.querySelectorAll(".graph-node");
    if (nodes.length === 0) return;
    const canvasBox = canvasEl.getBoundingClientRect();
    let top = Infinity;
    let bottom = -Infinity;
    for (const node of nodes) {
      const box = node.getBoundingClientRect();
      if (box.top < top) top = box.top;
      if (box.bottom > bottom) bottom = box.bottom;
    }
    const style = getComputedStyle(canvasEl);
    const padTop = parseFloat(style.paddingTop) || 0;
    const padBottom = parseFloat(style.paddingBottom) || 0;
    const slackTop = Math.max(0, top - canvasBox.top - padTop);
    const slackBottom = Math.max(0, canvasBox.bottom - bottom - padBottom);
    if (slackTop <= 0.5 && slackBottom <= 0.5) return;
    const nextHeight = scrollEl.getBoundingClientRect().height - slackTop - slackBottom;
    if (nextHeight <= 0) return;
    writeStyle(scrollEl, "height", `${px(nextHeight)}px`);
    if (slackTop > 0.5) writeStyle(canvasEl, "transform", `translateY(${px(-slackTop)}px)`);
  }

  function clearFolderNames(canvas) {
    const folders = [...canvas.querySelectorAll(".graph-folder:has(.branch-folder)")];
    for (const folder of folders) folder.style.paddingRight = "";
    for (const folder of folders) {
      const label = folder.querySelector(".graph-label");
      if (!label) continue;
      const style = getComputedStyle(folder);
      const padLeft = parseFloat(style.paddingLeft) || 0;
      const padRight = parseFloat(style.paddingRight) || 0;
      const text = label.scrollWidth;
      const inner = folder.clientWidth - padLeft - padRight;
      let next = padRight;
      if (text >= inner - 0.5) next = Math.max(padRight, NAME_CLEARANCE);
      else {
        const gap = padRight + (inner - text) / 2;
        if (gap < NAME_CLEARANCE) {
          next = 2 * NAME_CLEARANCE - (folder.clientWidth - padLeft - text);
          if (folder.clientWidth - padLeft - next < text) next = NAME_CLEARANCE;
          next = Math.max(padRight, next);
        }
      }
      if (next > padRight + 0.5) folder.style.paddingRight = `${px(next)}px`;
    }
  }

  function balanceJoints(canvas) {
    const joints = [...canvas.querySelectorAll(".graph-joint")];
    for (const joint of joints) {
      const list = joint.querySelector(":scope > .graph-children");
      if (!list) continue;
      list.style.paddingTop = "0px";
      list.style.paddingBottom = "0px";
      for (const branch of list.children) {
        if (!branch.classList?.contains("graph-branch")) continue;
        branch.style.marginTop = "0px";
      }
    }
    joints.sort((a, b) => jointDepth(b) - jointDepth(a));
    for (const joint of joints) {
      const list = joint.querySelector(":scope > .graph-children");
      const branches = [...(list?.children || [])].filter((el) => el.classList.contains("graph-branch"));
      if (branches.length < 2) continue;
      const delta = (branches[0].offsetHeight - branches[branches.length - 1].offsetHeight) / 2;
      if (delta > 0.5) list.style.paddingBottom = `${px(delta)}px`;
      else if (delta < -0.5) list.style.paddingTop = `${px(-delta)}px`;
      openAroundMiddle(branches);
    }
  }

  function connectorPath(joint, origin) {
    const stem = joint.querySelector(":scope > .graph-stem");
    const nodes = [...joint.querySelectorAll(":scope > .graph-children > .graph-branch > .graph-node")];
    if (!stem || nodes.length === 0) return null;
    const stemBox = metrics(stem, origin);
    const kids = nodes.map((node) => metrics(node, origin));
    const parent = joint.parentElement?.classList.contains("graph-branch")
      ? joint.parentElement.querySelector(":scope > .graph-node")
      : null;
    const startX = parent ? metrics(parent, origin).right : stemBox.left;
    const spine = stemBox.right;
    const first = kids[0];
    const last = kids[kids.length - 1];
    const midY = (first.cy + last.cy) / 2;
    if (kids.length === 1 || Math.abs(last.cy - first.cy) < 1) {
      return [`M ${px(startX)} ${px(kids.length === 1 ? first.cy : midY)} H ${px(first.left)}`];
    }
    const elbow = Math.min(...kids.map((kid) => Math.max(0, kid.left - spine)));
    let gap = Infinity;
    for (let index = 1; index < kids.length; index += 1) gap = Math.min(gap, kids[index].cy - kids[index - 1].cy);
    const radius = Math.min(BEND, elbow * 0.8, gap / 2);
    const parts = [`M ${px(startX)} ${px(midY)} H ${px(spine)}`];
    if (radius < 1) {
      parts.push(`M ${px(spine)} ${px(first.cy)} V ${px(last.cy)}`);
      for (const kid of kids) parts.push(`M ${px(spine)} ${px(kid.cy)} H ${px(kid.left)}`);
      return parts;
    }
    parts.push(`M ${px(spine)} ${px(first.cy + radius)} V ${px(last.cy - radius)}`);
    for (const kid of kids) parts.push(bendTowardMiddle(spine, kid, radius, midY));
    return parts;
  }

  function onKeyDown(event) {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const node = event.target.closest?.(".graph-node");
    if (!node || !host.contains(node)) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocus(node, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(node, -1);
        break;
      case "ArrowRight":
        event.preventDefault();
        openOrEnter(node);
        break;
      case "ArrowLeft":
        event.preventDefault();
        closeOrExit(node);
        break;
      case "Home":
        event.preventDefault();
        focus(host.querySelector(".graph-node")?.dataset.id);
        break;
      case "End": {
        event.preventDefault();
        const all = host.querySelectorAll(".graph-node");
        focus(all[all.length - 1]?.dataset.id);
        break;
      }
      case "Enter":
        if (node.hasAttribute("data-section-root") || !node.hasAttribute("aria-expanded")) return;
        event.preventDefault();
        onToggle(node.dataset.id, node.getAttribute("aria-expanded") !== "true");
        break;
      case " ":
        event.preventDefault();
        if (node.hasAttribute("data-section-root")) return;
        if (node.hasAttribute("aria-expanded")) onToggle(node.dataset.id, node.getAttribute("aria-expanded") !== "true");
        else node.click();
        break;
      default:
        break;
    }
  }

  function moveFocus(node, direction) {
    const all = [...host.querySelectorAll(".graph-node")];
    const next = all[all.indexOf(node) + direction];
    if (next) focus(next.dataset.id);
  }

  function openOrEnter(node) {
    const state = node.getAttribute("aria-expanded");
    if (state === "false") {
      onToggle(node.dataset.id, true);
      return;
    }
    if (state !== "true") return;
    const child = node.closest(".graph-branch")?.querySelector(":scope > .graph-joint > .graph-children > .graph-branch > .graph-node");
    if (child) focus(child.dataset.id);
  }

  function closeOrExit(node) {
    if (node.hasAttribute("data-section-root")) return;
    if (node.getAttribute("aria-expanded") === "true") {
      onToggle(node.dataset.id, false);
      return;
    }
    const above = node.closest(".graph-branch")?.parentElement?.closest(".graph-branch");
    const parent = above?.querySelector(":scope > .graph-node");
    if (parent) focus(parent.dataset.id);
  }

  function reveal(id) {
    const node = findNode(id);
    node?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function focusedId() {
    const active = document.activeElement;
    if (!(active instanceof Element) || !host.contains(active)) return "";
    return active.closest(".graph-node")?.dataset.id || "";
  }

  function findNode(id) {
    if (!id) return null;
    return host.querySelector(`.graph-node[data-id="${CSS.escape(id)}"]`);
  }

  return { setTree, showMessage, clear, sync, focus, destroy };
}

function jointDepth(joint) {
  let depth = 0;
  let node = joint.parentElement;
  while (node) {
    if (node.classList?.contains("graph-joint")) depth += 1;
    node = node.parentElement;
  }
  return depth;
}

function bend(spine, kid, radius, endY) {
  return `M ${px(kid.left)} ${px(kid.cy)} H ${px(spine + radius)} Q ${px(spine)} ${px(kid.cy)} ${px(spine)} ${px(endY)}`;
}

function openAroundMiddle(branches) {
  const centers = branches.map((branch) => {
    const rect = branch.querySelector(":scope > .graph-node").getBoundingClientRect();
    return rect.top + rect.height / 2;
  });
  const mid = (centers[0] + centers[centers.length - 1]) / 2;
  const need = BEND + MIDDLE_CLEAR;
  let shortfall = 0;
  let onIndex = -1;
  let belowIndex = -1;
  for (let index = 0; index < centers.length; index += 1) {
    const dist = centers[index] - mid;
    if (Math.abs(dist) <= 0.75) onIndex = index;
    else {
      shortfall = Math.max(shortfall, need - Math.abs(dist));
      if (dist > 0 && belowIndex < 0) belowIndex = index;
    }
  }
  if (shortfall <= 0.5) return;
  const extra = shortfall * 2;
  if (onIndex >= 0) {
    branches[onIndex].style.marginTop = `${px(extra / 2)}px`;
    if (branches[onIndex + 1]) branches[onIndex + 1].style.marginTop = `${px(extra / 2)}px`;
    return;
  }
  if (belowIndex >= 0) branches[belowIndex].style.marginTop = `${px(extra)}px`;
}

function bendTowardMiddle(spine, kid, radius, midY) {
  if (Math.abs(kid.cy - midY) <= 0.75) return `M ${px(spine)} ${px(kid.cy)} H ${px(kid.left)}`;
  const endY = kid.cy < midY ? kid.cy + radius : kid.cy - radius;
  return bend(spine, kid, radius, endY);
}

function writeStyle(element, prop, value) {
  if (element.style[prop] !== value) element.style[prop] = value;
}

function metrics(element, origin) {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left - origin.left,
    right: rect.right - origin.left,
    cy: rect.top - origin.top + rect.height / 2,
  };
}

function px(value) {
  return (Math.round(value * 100) / 100).toString();
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
  for (const needle of needles || []) {
    if (!needle) continue;
    let index = lower.indexOf(needle.toLowerCase());
    while (index !== -1) {
      ranges.push([index, index + needle.length]);
      index = lower.indexOf(needle.toLowerCase(), index + needle.length);
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
