import { remembers } from "./memory.js";
import { readRemembered, watchRemembered, writeRemembered } from "./storage.js";
import { faviconFor } from "../bookmarks/favicon.js";
import { cloneSubtree, indexForMove, isNoopMove, itemLabel, nodeIsInside } from "../bookmarks/ops.js";
import { closeIcon, headerCollapseIcon, headerExpandIcon } from "../ui/icons.js";
import { countTree, filterBookmarks, folderIdsInBranch, folderIdsWithinDepth, formatMatchSummary, formatSummary, isPermanent, listFolders, preferredFolderId, ROOT_ID } from "../bookmarks/model.js";
import { createBookmark, loadBookmarkTree, moveBookmark, mutateBookmarks, removeBookmark, updateBookmark, watchBookmarks } from "../bookmarks/service.js";
import { attachEdgeScroll } from "../ui/autoscroll.js";
import { attachScrollHover } from "../ui/hover.js";
import { mountEditor } from "../ui/editor.js";
import { mountToasts } from "../ui/toast.js";
import { mountSettings } from "../settings/drawer.js";
import { applySettings, notifySettings, readSettings, watchSettings, writeSettings } from "../settings/theme.js";
import { attachTreeKeyboard } from "../tree/keyboard.js";
import { attachSectionReorder } from "../sections/reorder.js";
import { createDragSession } from "../tree/drag.js";
import { createTreeView } from "../tree/view.js";
import { createGraphView } from "../graph/view.js";
import { mountFavourites } from "../favourites/view.js";
import { openSidePanelLinks, readActivePage } from "./panel.js";
import { isShortcut } from "../ui/shortcut.js";

const DEFAULT_SECTION = "default";
const EMPTY_SET = new Set();

const sectionsMount = document.querySelector("#sections");
const rail = document.querySelector("#section-rail");
const railList = document.querySelector("#section-rail-list");
const sectionNew = document.querySelector("#section-new");
const searchDock = document.querySelector("#search-dock");
const searchForm = document.querySelector("#bookmark-search-form");
const searchInput = document.querySelector("#bookmark-search");
const searchSave = document.querySelector("#bookmark-search-save");
const searchClear = document.querySelector("#bookmark-search-clear");
const tagList = document.querySelector("#filter-tags");
const open = new Set();
let hiddenBySection = new Map();
let expandDepth = readSettings().expandDepth;
let memory = memoryKey(readSettings());
let folders = folderKey(readSettings());
let sectionsStamp = sectionKey(readSettings());
let current = null;
let requestId = 0;
let depthApplied = false;
let searchQuery = "";
let appliedQuery = "";
let appliedNeedles = [];
let searching = false;
let filtersKey = filterKey(readSettings());
let addRow = readSettings().showAddRow;
let hideFolders = readSettings().showHideButton;
const searchClosed = new Set();
const searchOpened = new Set();
let forceOpen = new Set();
let editing = false;
let bookmarkingPage = false;
let trackedBookmarkId = "";
let bookmarkFolderId = readSettings().bookmarkFolderId;
let bookmarkUseLastFolder = readSettings().bookmarkUseLastFolder;
let pendingFocus = null;
let pendingLabelEdit = null;
let folderDraft = null;
let formSection = DEFAULT_SECTION;
let chain = Promise.resolve();
let sectionsShown = null;
let sectionSlide = 0;
let topCollapse = 0;
let openWrite = Promise.resolve();
let revealSections = readSettings().revealSections;
let sectionsEnabled = readSettings().sectionsEnabled;
let graphSetting = readSettings().showGraph;
let recenterSetting = readSettings().recenterGraph;
let centerGraphs = false;
let sectionPointerX = null;
let sectionPointerY = null;
let sectionHolding = false;

const sectionViews = new Map();
const dragSession = createDragSession();

const editToggle = document.querySelector("#edit-toggle");
const bookmarkPageButton = document.querySelector("#bookmark-page");
const sectionsToggle = document.querySelector("#sections-toggle");
const editBanner = document.querySelector("#edit-banner");
const editor = mountEditor(document.querySelector("#edit-popover"));
const toasts = mountToasts(document.querySelector("#undo-stack"));

dragSession.onFolderDrag = (folderId) => {
  const show = sectionsEnabled && Boolean(folderId) && !folderHasSection(folderId);
  sectionNew.hidden = !show;
  if (!show) sectionNew.classList.remove("is-armed");
};
dragSession.onPendingSection = (folderId) => createSection(folderId);

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveFilter();
});
tagList.addEventListener("click", (event) => {
  const remove = event.target.closest(".filter-tag-delete");
  if (remove && tagList.contains(remove)) {
    deleteFilter(remove.dataset.id);
    return;
  }
  const tag = event.target.closest(".filter-tag");
  if (!tag || !tagList.contains(tag)) return;
  const id = tag.querySelector(".filter-tag-select")?.dataset.id;
  if (id) toggleFilter(id);
});
let searchHeightFrame = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(searchHeightFrame);
  searchHeightFrame = requestAnimationFrame(() => {
    const next = `${Math.ceil(searchDock.getBoundingClientRect().height)}px`;
    if (document.documentElement.style.getPropertyValue("--search-dock-height") !== next) {
      document.documentElement.style.setProperty("--search-dock-height", next);
    }
  });
}).observe(searchDock);
renderTags();
document.addEventListener("keydown", onPageKey, true);
document.addEventListener("keydown", onCommandKey, true);
openSidePanelLinks();
bookmarkPageButton?.addEventListener("click", () => {
  void bookmarkCurrentPage();
});
window.addEventListener("pagehide", releaseTrackedBookmark);
searchInput.addEventListener("input", onSearchInput);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (searchInput.value) clearSearch();
    searchInput.blur();
    return;
  }
  if (event.key !== "ArrowDown") return;
  const first = sectionsMount.querySelector(".panel:not([hidden]) .tree-host:not([hidden]) [role='treeitem'], .panel:not([hidden]) .graph-host:not([hidden]) [role='treeitem']");
  if (!first) return;
  event.preventDefault();
  const sectionId = first.closest("[data-section-id]")?.dataset.sectionId ?? DEFAULT_SECTION;
  const entry = sectionViews.get(sectionId);
  if (first.closest(".graph-host")) entry?.graph.focus(first.dataset.id);
  else entry?.view.focus(first.dataset.id);
});
searchClear.addEventListener("click", () => {
  clearSearch();
  searchInput.focus();
});

editToggle.addEventListener("click", () => {
  editing = !editing;
  syncEditing();
  paint();
  syncSectionsToggle();
});
editBanner.addEventListener("click", () => {
  if (!editing) return;
  editing = false;
  syncEditing();
  paint();
  syncSectionsToggle();
});
sectionsToggle.addEventListener("click", () => {
  if (editing || !sectionsEnabled) return;
  const settings = readSettings();
  settings.showSections = document.documentElement.dataset.sections === "off";
  if (!settings.showSections && rail.contains(document.activeElement)) sectionsToggle.focus();
  writeSettings(settings);
  applySettings(settings);
  syncSectionsToggle();
});
document.addEventListener("pointermove", onSectionPointer, { passive: true });
document.addEventListener("pointerleave", () => {
  sectionPointerX = null;
  sectionPointerY = null;
  if (!sectionHolding) syncSectionsToggle();
});
rail.addEventListener("pointerdown", () => {
  sectionHolding = true;
});
window.addEventListener("pointerup", releaseSectionPointer);
window.addEventListener("pointercancel", releaseSectionPointer);
syncSectionsPlace();
syncSectionsToggle();
let sectionsPlaceWidth = window.innerWidth;
window.addEventListener("resize", () => {
  if (window.innerWidth === sectionsPlaceWidth) return;
  sectionsPlaceWidth = window.innerWidth;
  if (syncSectionsPlace()) syncSectionsToggle();
});
let railSpaceFrame = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(railSpaceFrame);
  railSpaceFrame = requestAnimationFrame(() => syncSectionRailSpace());
}).observe(rail);

rail.addEventListener("click", (event) => {
  const remove = event.target.closest(".section-remove");
  if (remove && rail.contains(remove)) {
    event.preventDefault();
    removeSection(remove.dataset.sectionId);
    return;
  }
  const button = event.target.closest(".section-toggle");
  if (!button || !rail.contains(button)) return;
  toggleSectionVisible(button.dataset.sectionId);
});
sectionNew.addEventListener("dragover", (event) => {
  if (!sectionsEnabled || !dragSession.folder || !dragSession.dragId || folderHasSection(dragSession.dragId)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  sectionNew.classList.add("is-armed");
  dragSession.clearMark();
});
sectionNew.addEventListener("dragleave", (event) => {
  if (sectionNew.contains(event.relatedTarget)) return;
  sectionNew.classList.remove("is-armed");
});
sectionNew.addEventListener("drop", (event) => {
  if (!sectionsEnabled || !dragSession.folder || !dragSession.dragId || folderHasSection(dragSession.dragId)) return;
  event.preventDefault();
  // Leave the dragged row in place until dragend. Replacing it earlier makes
  // Chrome keep the drag cursor and the dragged row's action buttons on screen.
  dragSession.pendingSection = dragSession.dragId;
});
attachSectionReorder({
  rail,
  railList,
  sectionsMount,
  isEditing: () => editing && readSettings().sectionsEnabled,
  isBlocked: () => Boolean(dragSession.dragId),
  sectionIds: () => readSettings().sections.map((section) => section.id),
  onReorder: moveSection,
});
document.addEventListener("dragover", (event) => {
  if (!dragSession.dragId) return;
  if (event.target instanceof Element && event.target.closest(".tree-host")) return;
  dragSession.clearMark();
});
attachEdgeScroll();
attachScrollHover();

const favourites = mountFavourites({
  host: document.querySelector("#favourites"),
  list: document.querySelector("#favourites-list"),
  dragSession,
  isEditing: () => editing,
  faviconFor,
  getNeedles: () => appliedNeedles,
  getBookmark: (id) => current?.byId.get(id) ?? null,
});

mountSettings();

const pendingTree = loadBookmarkTree();

watchSettings((settings, local) => {
  if (!settings.bookmarkUseLastFolder && (settings.bookmarkFolderId !== bookmarkFolderId || settings.bookmarkUseLastFolder !== bookmarkUseLastFolder)) {
    trackedBookmarkId = "";
  }
  bookmarkFolderId = settings.bookmarkFolderId;
  bookmarkUseLastFolder = settings.bookmarkUseLastFolder;
  revealSections = settings.revealSections;
  const featureChanged = settings.sectionsEnabled !== sectionsEnabled;
  sectionsEnabled = settings.sectionsEnabled;
  const graphChanged = settings.showGraph !== graphSetting;
  const recenterChanged = settings.recenterGraph !== recenterSetting;
  graphSetting = settings.showGraph;
  recenterSetting = settings.recenterGraph;
  syncSectionsToggle();
  const nextMemory = memoryKey(settings);
  const nextFolders = folderKey(settings);
  const nextFilters = filterKey(settings);
  const nextSections = sectionKey(settings);
  const depthChanged = settings.expandDepth !== expandDepth;
  const memoryChanged = nextMemory !== memory;
  const foldersChanged = nextFolders !== folders;
  const filtersChanged = nextFilters !== filtersKey;
  const sectionsChanged = nextSections !== sectionsStamp;
  const addRowChanged = settings.showAddRow !== addRow;
  const hideChanged = settings.showHideButton !== hideFolders;
  expandDepth = settings.expandDepth;
  memory = nextMemory;
  folders = nextFolders;
  filtersKey = nextFilters;
  sectionsStamp = nextSections;
  addRow = settings.showAddRow;
  hideFolders = settings.showHideButton;
  if (filtersChanged) renderTags();
  if ((foldersChanged || sectionsChanged || filtersChanged || graphChanged || recenterChanged || featureChanged || hideChanged || (addRowChanged && editing)) && current) paint();
  if (!local || !current) return;
  if (depthChanged) applyDepth();
  else if (memoryChanged && remembers(settings)) void persistOpen();
});

await refresh();
watchBookmarks(() => {
  refresh();
});
watchRemembered(() => {
  void applyRemote();
});

async function refresh() {
  const token = ++requestId;
  const activeItem = document.activeElement?.closest?.("[role='treeitem']");
  const focusId = activeItem?.dataset.id ?? "";
  const focusSection = activeItem?.closest("[data-section-id]")?.dataset.sectionId ?? "";
  try {
    const data = await (token === 1 ? pendingTree : loadBookmarkTree());
    if (token !== requestId) return;
    current = data;
    let createdFresh = false;
    if (!depthApplied) {
      depthApplied = true;
      const remembered = await readRemembered(readSettings());
      if (token !== requestId) return;
      if (remembered != null) replaceOpen(remembered);
      else {
        replaceOpen(folderIdsWithinDepth(data.roots, expandDepth));
        createdFresh = true;
      }
    }
    const stale = [...open].filter((id) => !data.byId.has(id));
    if (stale.length > 0) {
      for (const id of stale) open.delete(id);
      void persistOpen();
    } else if (createdFresh) {
      void persistOpen();
    }
    const renamed = syncSavedNames(data.byId);
    followTrackedBookmark();
    paint(focusId, focusSection);
    if (renamed) notifySettings();
  } catch {
    if (token !== requestId) return;
    current = null;
    showLoadError();
  }
}

function showLoadError() {
  const entry = ensureSectionView({ id: DEFAULT_SECTION, folderId: ROOT_ID, visible: true, title: "Bookmarks" });
  entry.panel.hidden = false;
  entry.graphShown = false;
  entry.host.hidden = false;
  entry.graphHost.hidden = true;
  entry.graph.clear();
  entry.summary.textContent = "Bookmarks are unavailable.";
  entry.view.showMessage("The bookmarks list could not be loaded.");
  entry.shownRoots = null;
  syncBranchToggle(entry);
  favourites.paint();
  for (const other of sectionViews.values()) {
    if (other.id !== DEFAULT_SECTION) other.panel.hidden = true;
  }
  sectionsNote(false);
}

function applyDepth() {
  if (!current) return;
  replaceOpen(folderIdsWithinDepth(current.roots, expandDepth));
  void persistOpen();
  const activeItem = document.activeElement?.closest?.("[role='treeitem']");
  paint(activeItem?.dataset.id ?? "", activeItem?.closest("[data-section-id]")?.dataset.sectionId ?? "");
}

function paint(focusId = "", focusSection = "") {
  if (!current) return;
  syncHidden();
  const activeEl = document.activeElement;
  const graphNode = activeEl instanceof Element ? activeEl.closest(".graph-node") : null;
  const activeItem = graphNode || (activeEl?.closest?.("button") ? null : activeEl?.closest?.("[role='treeitem']"));
  const activeId = activeItem?.dataset.id ?? "";
  const activeSection = activeItem?.closest("[data-section-id]")?.dataset.sectionId ?? "";
  if (folderDraft && !draftParentLive(folderDraft)) clearFolderDraft();
  const draft = currentLabelDraft();
  const resume = draft || pendingLabelEdit;
  const settings = readSettings();
  const resumeDraft = Boolean(resume?.id && showingDraft(resume.sectionId, resume.id));
  if (pendingFocus && current.byId.has(pendingFocus.id)) reveal(pendingFocus.id, stopFor(settings, pendingFocus.sectionId));
  if (!resumeDraft && resume?.id && sectionById(settings, resume.sectionId) && nodeInSection(sectionById(settings, resume.sectionId), resume.id)) {
    reveal(resume.id, stopFor(settings, resume.sectionId));
  }
  const needles = editing ? [] : activeNeedles();
  const needleKey = needles.join("\n");
  if (needleKey !== appliedQuery) {
    appliedQuery = needleKey;
    appliedNeedles = needles;
    searchClosed.clear();
    searchOpened.clear();
  }
  searching = needles.length > 0;
  if (!searching) forceOpen = new Set();
  renderRail(settings.sections);
  const plans = [];
  const live = new Set();
  let anyVisible = false;
  if (searching) forceOpen = new Set();
  for (const section of settings.sections) {
    live.add(section.id);
    const entry = ensureSectionView(section);
    const include = settings.sectionsEnabled ? section.visible : section.id === DEFAULT_SECTION;
    entry.panel.hidden = !include;
    entry.title.textContent = section.title;
    entry.host.setAttribute("aria-label", section.title);
    entry.graphHost.setAttribute("aria-label", section.title);
    syncGraphButton(entry, section);
    sectionsMount.append(entry.panel);
    entry.shownRoots = null;
    if (!include) {
      entry.filteredById = null;
      entry.graphShown = false;
      continue;
    }
    anyVisible = true;
    const roots = sectionRoots(section);
    const concealed = hiddenFor(section.id);
    const graph = sectionUsesGraph(section);
    if (!roots) {
      entry.filteredById = null;
      plans.push({ entry, message: "This folder is no longer available.", summary: "", graph });
      continue;
    }
    if (!searching) {
      entry.filteredById = null;
      const presented = withFolderDraft(section, roots, current.byId);
      const stats = section.folderId === ROOT_ID ? current.stats : countTree(roots);
      const visible = editing || roots.some((node) => !concealed.has(node.id));
      let message = "";
      if (!editing && roots.length === 0) message = "No bookmarks yet.";
      else if (!editing && !visible) message = "Every folder is hidden.";
      entry.shownRoots = presented.roots;
      plans.push({
        entry,
        message,
        roots: presented.roots,
        byId: presented.byId,
        parentId: section.folderId,
        summary: formatSummary(stats),
        graph,
      });
      continue;
    }
    const filtered = filterBookmarks(roots, needles, concealed);
    entry.filteredById = filtered.byId;
    entry.shownRoots = filtered.roots;
    for (const id of filtered.forceOpen) forceOpen.add(id);
    plans.push({
      entry,
      message: filtered.roots.length === 0 ? "No bookmarks match." : "",
      roots: filtered.roots,
      byId: filtered.byId,
      parentId: section.folderId,
      summary: formatMatchSummary(filtered.matches),
      graph,
    });
  }
  for (const id of [...sectionViews.keys()]) {
    if (live.has(id)) continue;
    const entry = sectionViews.get(id);
    dragSession.hosts.delete(entry.host);
    entry.graph.destroy();
    entry.panel.remove();
    sectionViews.delete(id);
  }
  for (const entry of sectionViews.values()) syncBranchToggle(entry);
  sectionsNote(!anyVisible);
  favourites.paint();
  for (const plan of plans) {
    plan.entry.summary.textContent = plan.summary;
    const openingGraph = Boolean(plan.graph) && !plan.entry.graphShown;
    plan.entry.graphShown = Boolean(plan.graph);
    plan.entry.host.hidden = plan.entry.graphShown;
    plan.entry.graphHost.hidden = !plan.entry.graphShown;
    if (plan.graph) {
      if (plan.message) plan.entry.graph.showMessage(plan.message);
      else plan.entry.graph.setTree(plan.roots, { id: plan.parentId, title: plan.entry.title.textContent }, (openingGraph && !readSettings().recenterGraph) || centerGraphs);
    } else {
      plan.entry.graph.clear();
      if (plan.message) plan.entry.view.showMessage(plan.message);
      else plan.entry.view.setTree(plan.roots, plan.byId, plan.parentId);
    }
  }
  const wanted = pendingFocus?.id ? pendingFocus : null;
  const wantedId = wanted?.id || focusId || activeId;
  const wantedSection = wanted?.sectionId || focusSection || activeSection;
  if (pendingFocus && current.byId.has(pendingFocus.id)) pendingFocus = null;
  if (resumeDraft || (resume?.id && shown(resume.sectionId, resume.id))) editLabelSoon(resume);
  else if (wantedId && pickSection(wantedSection, wantedId)) focusSoon(wantedSection, wantedId);
}

function sectionsNote(show) {
  let note = sectionsMount.querySelector(".sections-empty");
  if (!show) {
    if (note) note.hidden = true;
    return;
  }
  if (!note) {
    note = document.createElement("p");
    note.className = "sections-empty";
    note.textContent = "Every section is hidden.";
    sectionsMount.prepend(note);
  }
  note.hidden = false;
}

function renderRail(sections) {
  const active = document.activeElement;
  const activeItem = active?.closest?.(".section-rail-item");
  const restoreRail = Boolean(activeItem && rail.contains(activeItem));
  const activeId = restoreRail ? activeItem.dataset.sectionId : "";
  const activeRemove = Boolean(active?.closest?.(".section-remove"));
  railList.replaceChildren();
  const step = 50;
  sections.forEach((section, index) => {
    const item = document.createElement("div");
    item.className = "section-rail-item";
    item.dataset.sectionId = section.id;
    item.style.setProperty("--section-in", `${index * step}ms`);
    item.style.setProperty("--section-out", `${(sections.length - 1 - index) * step}ms`);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "section-toggle";
    button.dataset.sectionId = section.id;
    button.setAttribute("aria-pressed", section.visible ? "true" : "false");
    button.title = section.visible ? `Hide ${section.title}` : `Show ${section.title}`;
    const label = document.createElement("span");
    label.className = "section-toggle-label";
    label.textContent = section.title;
    button.append(label);
    item.append(button);
    if (editing && section.id !== DEFAULT_SECTION) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "section-remove";
      remove.dataset.sectionId = section.id;
      remove.setAttribute("aria-label", `Remove section ${section.title}`);
      remove.title = "Remove section";
      remove.append(closeIcon());
      item.append(remove);
    }
    railList.append(item);
  });
  if (!activeId) return;
  const selector = activeRemove ? ".section-remove" : ".section-toggle";
  railList.querySelector(`.section-rail-item[data-section-id="${CSS.escape(activeId)}"] ${selector}`)?.focus();
}

function ensureSectionView(section) {
  const existing = sectionViews.get(section.id);
  if (existing) return existing;
  let panel = sectionsMount.querySelector(`:scope > .panel[data-section-id="${CSS.escape(section.id)}"]`);
  if (!panel) {
    panel = createPanel(section);
    sectionsMount.append(panel);
  }
  const host = panel.querySelector(".tree-host");
  const graphHost = panel.querySelector(".graph-host");
  const graphButton = panel.querySelector(".graph-toggle");
  const branchButton = panel.querySelector(".branch-toggle");
  const header = panel.querySelector(".header");
  const title = panel.querySelector(".section-title");
  const summary = panel.querySelector(".meta");
  header.dataset.sectionId = section.id;
  header.draggable = false;
  const view = createTreeView(host, {
    faviconFor,
    getNeedles: () => appliedNeedles,
    isOpen: (id) => {
      if (!searching) return open.has(id);
      if (searchClosed.has(id)) return false;
      if (searchOpened.has(id) || forceOpen.has(id)) return true;
      return open.has(id);
    },
    isHidden: (id) => hiddenFor(section.id).has(id),
    onToggle(id, next) {
      handleToggle(section.id, id, next);
    },
    onToggleHidden(id, folderTitle) {
      setFolderHidden(section.id, id, folderTitle, !hiddenFor(section.id).has(id));
    },
    onBranch(id, expand) {
      branchSection(section.id, id, expand);
    },
    isEditing: () => editing,
    onEdit: editNode,
    onDelete(id) {
      void enqueue(() => deleteNode(id, false, section.id));
    },
    onAdd: addNode,
    onCreate: createIn,
    showAddRow: () => editing && readSettings().showAddRow,
    doubleClickBranch: () => readSettings().showExpandButton && readSettings().doubleClickBranch,
    doubleClickRename: () => readSettings().doubleClickRename,
    onMove(id, destination) {
      void enqueue(() => moveNode(id, destination, section.id));
    },
    onFolderCommit(id, folderTitle, info) {
      void enqueue(() => commitFolderName(id, folderTitle, info, section.id));
    },
    onFolderCancel(id, info) {
      void enqueue(() => cancelFolderName(id, info));
    },
    dragSession,
  });
  graphButton.addEventListener("click", (event) => {
    event.preventDefault();
    toggleSectionGraph(section.id);
  });
  branchButton.addEventListener("click", (event) => {
    event.preventDefault();
    toggleSectionBranch(section.id);
  });
  const graph = createGraphView(graphHost, {
    faviconFor,
    isOpen: (id) => {
      if (!searching) return open.has(id);
      if (searchClosed.has(id)) return false;
      if (searchOpened.has(id) || forceOpen.has(id)) return true;
      return open.has(id);
    },
    isHidden: (id) => hiddenFor(section.id).has(id),
    onToggle(id, next) {
      handleToggle(section.id, id, next);
    },
    onBranch(id, expand) {
      branchSection(section.id, id, expand);
    },
    getNeedles: () => appliedNeedles,
    doubleClickBranch: () => readSettings().showExpandButton && readSettings().doubleClickBranch,
    recenter: () => readSettings().recenterGraph,
  });
  attachTreeKeyboard(host, {
    onToggle(id) {
      view.toggle(id);
    },
    onEdit(id) {
      const row = host.querySelector(`[role="treeitem"][data-id="${CSS.escape(id)}"]`);
      editNode(id, row || host);
    },
    onDelete(id) {
      void enqueue(() => deleteNode(id, true, section.id));
    },
    isEditing: () => editing,
  });
  const entry = { id: section.id, panel, host, graphHost, graphButton, branchButton, header, title, summary, view, graph, graphShown: false, filteredById: null, shownRoots: null };
  sectionViews.set(section.id, entry);
  return entry;
}

function createPanel(section) {
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.dataset.sectionId = section.id;
  const header = document.createElement("header");
  header.className = "header";
  const heading = document.createElement("h1");
  const title = document.createElement("span");
  title.className = "section-title";
  title.textContent = section.title;
  heading.append(titleMark(), title);
  const bar = document.createElement("div");
  bar.className = "header-bar";
  const actions = document.createElement("div");
  actions.className = "header-actions";
  actions.append(branchToggle(), graphToggle());
  bar.append(heading, actions);
  const summary = document.createElement("p");
  summary.className = "meta";
  header.append(bar, summary);
  const host = document.createElement("div");
  host.className = "tree-host";
  host.setAttribute("role", "tree");
  host.setAttribute("aria-label", section.title);
  const graphHost = document.createElement("div");
  graphHost.className = "graph-host";
  graphHost.setAttribute("role", "tree");
  graphHost.setAttribute("aria-orientation", "horizontal");
  graphHost.setAttribute("aria-label", section.title);
  graphHost.hidden = true;
  panel.append(header, host, graphHost);
  return panel;
}

function branchToggle() {
  const existing = document.querySelector(".branch-toggle");
  if (existing) return existing.cloneNode(true);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "branch-toggle";
  button.dataset.action = "expand";
  button.title = "Expand all";
  button.append(headerExpandIcon());
  const text = document.createElement("span");
  text.className = "visually-hidden";
  text.textContent = "Expand all";
  button.append(text);
  return button;
}

function graphToggle() {
  const existing = document.querySelector(".graph-toggle");
  if (existing) {
    const copy = existing.cloneNode(true);
    copy.hidden = true;
    copy.setAttribute("aria-pressed", "false");
    const label = copy.querySelector(".visually-hidden");
    if (label) label.textContent = "Show as graph";
    copy.title = "Show as graph";
    return copy;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "graph-toggle";
  button.hidden = true;
  button.setAttribute("aria-pressed", "false");
  button.title = "Show as graph";
  const text = document.createElement("span");
  text.className = "visually-hidden";
  text.textContent = "Show as graph";
  button.append(text);
  return button;
}

function sectionUsesGraph(section) {
  return Boolean(section.graph) && readSettings().showGraph && !editing;
}

function syncGraphButton(entry, section) {
  const enabled = readSettings().showGraph && !editing;
  entry.graphButton.hidden = !enabled;
  const on = Boolean(section.graph);
  entry.graphButton.setAttribute("aria-pressed", on ? "true" : "false");
  const label = on ? "Show as list" : "Show as graph";
  entry.graphButton.title = label;
  const hiddenLabel = entry.graphButton.querySelector(".visually-hidden");
  if (hiddenLabel) hiddenLabel.textContent = label;
}

function syncBranchToggle(entry) {
  const available = sectionHasSubfolders(entry.id);
  entry.branchButton.hidden = !available;
  if (!available) return;
  const expanded = sectionIsExpanded(entry.id);
  const action = expanded ? "collapse" : "expand";
  const title = entry.title.textContent || "Bookmarks";
  const label = `${expanded ? "Collapse" : "Expand"} all in ${title}`;
  entry.branchButton.title = label;
  const text = entry.branchButton.querySelector(".visually-hidden");
  if (text) text.textContent = label;
  if (entry.branchButton.dataset.action === action) return;
  entry.branchButton.dataset.action = action;
  const icon = expanded ? headerCollapseIcon() : headerExpandIcon();
  const current = entry.branchButton.querySelector("svg");
  if (current) current.replaceWith(icon);
  else entry.branchButton.prepend(icon);
}

function sectionHasSubfolders(sectionId) {
  const roots = sectionViews.get(sectionId)?.shownRoots;
  if (!roots?.length) return false;
  const concealed = hiddenFor(sectionId);
  return roots.some((node) => node.children && !concealed.has(node.id));
}

function sectionIsExpanded(sectionId) {
  const roots = sectionViews.get(sectionId)?.shownRoots;
  if (!roots?.length) return false;
  const concealed = hiddenFor(sectionId);
  let folders = 0;
  const openBranch = (node) => {
    if (!node.children || concealed.has(node.id)) return true;
    folders += 1;
    if (!folderOpen(node.id)) return false;
    for (const child of node.children) {
      if (!openBranch(child)) return false;
    }
    return true;
  };
  for (const node of roots) {
    if (!openBranch(node)) return false;
  }
  return folders > 0;
}

function folderOpen(id) {
  if (!searching) return open.has(id);
  if (searchClosed.has(id)) return false;
  if (searchOpened.has(id) || forceOpen.has(id)) return true;
  return open.has(id);
}

function toggleSectionBranch(sectionId) {
  if (!readSettings().showExpandButton) return;
  const roots = sectionViews.get(sectionId)?.shownRoots;
  if (!roots?.length) return;
  const expand = !sectionIsExpanded(sectionId);
  const concealed = hiddenFor(sectionId);
  const ids = [];
  for (const node of roots) ids.push(...folderIdsInBranch(node, concealed));
  if (ids.length === 0) return;
  if (searching) {
    for (const id of ids) setSearchOpen(id, expand);
  } else {
    for (const id of ids) {
      if (expand) open.add(id);
      else open.delete(id);
    }
    void persistOpen();
  }
  paint();
}

function toggleSectionGraph(id) {
  if (editing || !readSettings().showGraph) return;
  const settings = readSettings();
  const section = sectionById(settings, id);
  if (!section) return;
  const x = window.scrollX;
  const y = window.scrollY;
  section.graph = !section.graph;
  saveSettings(settings);
  // Rebuilding the section drops the scroll anchor. The map also settles its
  // layout on the next frame, which can move the page again.
  const restore = () => window.scrollTo(x, y);
  restore();
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
}

function titleMark() {
  const existing = sectionsMount.querySelector(".title-mark");
  if (existing) return existing.cloneNode(true);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "title-mark");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("d", "M3.6 1.5h8.8A1.1 1.1 0 0 1 13.5 2.6V14.5L8 11.2 2.5 14.5V2.6A1.1 1.1 0 0 1 3.6 1.5z");
  svg.append(path);
  return svg;
}

function sectionRoots(section) {
  if (section.folderId === ROOT_ID) return current.roots;
  const node = current.byId.get(section.folderId);
  if (!node?.children) return null;
  return node.children;
}

function withFolderDraft(section, roots, byId) {
  if (!editing || !folderDraft || folderDraft.sectionId !== section.id || !draftParentLive(folderDraft)) {
    return { roots, byId };
  }
  const draft = {
    id: folderDraft.key,
    parentId: folderDraft.parentId,
    title: "",
    url: null,
    children: [],
    pending: true,
  };
  const nextById = new Map(byId);
  nextById.set(draft.id, draft);
  if (folderDraft.parentId === section.folderId) return { roots: roots.concat(draft), byId: nextById };
  const parent = byId.get(folderDraft.parentId);
  if (!parent?.children) return { roots, byId };
  const chain = [];
  let cursor = parent;
  while (cursor) {
    chain.push(cursor);
    if (cursor.parentId === section.folderId) break;
    cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
  }
  if (!cursor || cursor.parentId !== section.folderId) return { roots, byId };
  chain.reverse();
  const clones = new Map();
  for (const item of chain) {
    const clone = { ...item, children: item.children.slice() };
    clones.set(item.id, clone);
    nextById.set(item.id, clone);
  }
  for (let index = 0; index < chain.length - 1; index += 1) {
    const clonedParent = clones.get(chain[index].id);
    const clonedChild = clones.get(chain[index + 1].id);
    const at = clonedParent.children.findIndex((child) => child.id === clonedChild.id);
    if (at >= 0) clonedParent.children[at] = clonedChild;
  }
  clones.get(parent.id).children.push(draft);
  const top = clones.get(chain[0].id);
  return { roots: roots.map((item) => (item.id === top.id ? top : item)), byId: nextById };
}

function draftParentLive(draft) {
  const section = sectionById(readSettings(), draft.sectionId);
  if (!section) return false;
  if (draft.parentId === ROOT_ID) return section.folderId === ROOT_ID;
  if (!current?.byId.has(draft.parentId)) return false;
  if (draft.parentId === section.folderId) return true;
  return nodeInSection(section, draft.parentId);
}

function showingDraft(sectionId, id) {
  return Boolean(editing && folderDraft && folderDraft.key === id && folderDraft.sectionId === sectionId && draftParentLive(folderDraft));
}

function clearFolderDraft() {
  if (pendingLabelEdit?.id === folderDraft?.key) pendingLabelEdit = null;
  folderDraft = null;
}

function takeFreshDraft() {
  for (const entry of sectionViews.values()) {
    const taken = entry.view.takeFreshLabel();
    if (taken) return { ...taken, sectionId: entry.id };
  }
  return null;
}

function handleToggle(sectionId, id, next) {
  if (searching) setSearchOpen(id, next);
  else {
    if (next) open.add(id);
    else open.delete(id);
    void persistOpen();
  }
  for (const entry of sectionViews.values()) {
    if (entry.id !== sectionId) entry.view.syncOpen(id);
    if (entry.graphShown) entry.graph.sync(readSettings().recenterGraph);
    syncBranchToggle(entry);
  }
}

function branchSection(sectionId, id, expand) {
  const entry = sectionViews.get(sectionId);
  const node = (searching ? entry?.filteredById : current?.byId)?.get(id);
  if (!node?.children) return;
  const concealed = hiddenFor(sectionId);
  centerGraphs = readSettings().recenterGraph;
  if (searching) {
    for (const folderId of folderIdsInBranch(node, concealed)) setSearchOpen(folderId, expand);
    paint();
    centerGraphs = false;
    return;
  }
  for (const folderId of folderIdsInBranch(node, concealed)) {
    if (expand) open.add(folderId);
    else open.delete(folderId);
  }
  void persistOpen();
  paint();
  centerGraphs = false;
}

function onCommandKey(event) {
  if (isShortcut(event, "e")) {
    event.preventDefault();
    editToggle.click();
    return;
  }
  if (!isShortcut(event, "s")) return;
  event.preventDefault();
  if (!sectionsEnabled || editing) return;
  sectionsToggle.click();
}

function onPageKey(event) {
  if (editing || event.isComposing) return;
  if (isFindShortcut(event)) {
    event.preventDefault();
    if (event.repeat) return;
    searchInput.focus({ preventScroll: true });
    searchInput.select();
    return;
  }
  if (!isTypingKey(event) || isEditable(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  insertSearchText(event.key);
}

function isFindShortcut(event) {
  return isShortcut(event, "f");
}

function isTypingKey(event) {
  return event.key.length === 1 && event.key !== " " && !event.metaKey && !event.ctrlKey && !event.altKey;
}

function isEditable(target) {
  if (!(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  const field = target.closest("input, textarea, select");
  if (!field) return false;
  if (field instanceof HTMLInputElement && /^(button|checkbox|radio|range|color|file|submit|reset)$/.test(field.type)) return false;
  return true;
}

function insertSearchText(text) {
  searchInput.value += text;
  const caret = searchInput.value.length;
  searchInput.focus({ preventScroll: true });
  searchInput.setSelectionRange(caret, caret);
  onSearchInput();
}

function onSearchInput() {
  syncSearchButtons();
  const next = searchInput.value;
  if (next.trim().toLowerCase() === searchQuery.trim().toLowerCase()) {
    searchQuery = next;
    return;
  }
  searchQuery = next;
  paint();
}

function clearSearch() {
  searchInput.value = "";
  syncSearchButtons();
  if (!searchQuery) return;
  searchQuery = "";
  paint();
}

function syncSearchButtons() {
  searchClear.hidden = searchInput.value.length === 0;
  searchSave.hidden = searchInput.value.trim().length === 0;
}

function activeNeedles() {
  const needles = readSettings().filters.filter((filter) => filter.selected).map((filter) => filter.query);
  const typed = searchQuery.trim();
  if (typed) needles.push(typed);
  return needles;
}

function saveFilter() {
  const query = searchInput.value.trim().slice(0, 120);
  if (!query) return;
  const settings = readSettings();
  const existing = settings.filters.find((filter) => filter.query.toLowerCase() === query.toLowerCase());
  if (existing) existing.selected = true;
  else settings.filters.push({ id: crypto.randomUUID(), query, selected: true });
  if (settings.filters.length > 40) settings.filters.splice(0, settings.filters.length - 40);
  commitFilters(settings);
  clearSearch();
}

function toggleFilter(id) {
  const settings = readSettings();
  const filter = settings.filters.find((entry) => entry.id === id);
  if (!filter) return;
  filter.selected = !filter.selected;
  commitFilters(settings);
  paint();
}

function deleteFilter(id) {
  const settings = readSettings();
  const next = settings.filters.filter((entry) => entry.id !== id);
  if (next.length === settings.filters.length) return;
  settings.filters = next;
  commitFilters(settings);
  paint();
}

function commitFilters(settings) {
  writeSettings(settings);
  filtersKey = filterKey(settings);
  notifySettings();
  renderTags();
}

function renderTags() {
  const filters = readSettings().filters;
  tagList.replaceChildren();
  tagList.hidden = filters.length === 0;
  for (const filter of filters) {
    const item = document.createElement("li");
    item.className = "filter-tag";
    if (filter.selected) item.dataset.selected = "true";
    const select = document.createElement("button");
    select.type = "button";
    select.className = "filter-tag-select";
    select.dataset.id = filter.id;
    select.textContent = filter.query;
    select.title = filter.query;
    select.setAttribute("aria-pressed", filter.selected ? "true" : "false");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "filter-tag-delete";
    remove.dataset.id = filter.id;
    remove.setAttribute("aria-label", `Delete ${filter.query}`);
    remove.append(closeIcon());
    item.append(select, remove);
    tagList.append(item);
  }
}

function filterKey(settings) {
  return settings.filters.map((filter) => `${filter.id}\t${filter.query}\t${filter.selected ? 1 : 0}`).join("\n");
}

function setSearchOpen(id, next) {
  if (next) {
    searchClosed.delete(id);
    searchOpened.add(id);
  } else {
    searchOpened.delete(id);
    searchClosed.add(id);
  }
}

function syncHidden() {
  hiddenBySection = new Map();
  if (!readSettings().showHideButton) return;
  for (const folder of readSettings().folders) {
    if (!folder.hidden) continue;
    const sectionId = folder.sectionId || DEFAULT_SECTION;
    let set = hiddenBySection.get(sectionId);
    if (!set) {
      set = new Set();
      hiddenBySection.set(sectionId, set);
    }
    set.add(folder.id);
  }
}

function hiddenFor(sectionId) {
  return hiddenBySection.get(sectionId) ?? EMPTY_SET;
}

function shown(sectionId, id) {
  const settings = readSettings();
  const section = sectionById(settings, sectionId);
  if (!section?.visible || !nodeInSection(section, id)) return false;
  if (editing) return true;
  const concealed = hiddenFor(sectionId);
  let node = current.byId.get(id);
  while (node) {
    if (concealed.has(node.id)) return false;
    if (!node.parentId || node.parentId === ROOT_ID || node.parentId === section.folderId) break;
    node = current.byId.get(node.parentId);
  }
  return Boolean(node);
}

function nodeInSection(section, id) {
  if (!section || !current?.byId.has(id)) return false;
  if (section.folderId === ROOT_ID) return true;
  let node = current.byId.get(id);
  while (node) {
    if (node.parentId === section.folderId) return true;
    node = node.parentId && node.parentId !== ROOT_ID ? current.byId.get(node.parentId) : null;
  }
  return false;
}

function sectionById(settings, sectionId) {
  return settings.sections.find((section) => section.id === sectionId) ?? null;
}

function stopFor(settings, sectionId) {
  return sectionById(settings, sectionId)?.folderId ?? ROOT_ID;
}

function pickSection(sectionId, id) {
  if (shown(sectionId, id)) return sectionId;
  for (const section of readSettings().sections) {
    if (shown(section.id, id)) return section.id;
  }
  return "";
}

function setFolderHidden(sectionId, id, title, conceal) {
  const settings = readSettings();
  const name = title.trim() || "Untitled folder";
  const same = (folder) => folder.id === id && (folder.sectionId || DEFAULT_SECTION) === sectionId;
  const existing = settings.folders.find(same);
  if (existing) {
    existing.hidden = conceal;
    existing.title = name;
    if (conceal) settings.folders = [existing, ...settings.folders.filter((folder) => !same(folder))];
  } else if (conceal) {
    settings.folders.unshift({ id, sectionId, title: name, hidden: true });
  } else {
    return;
  }
  if (settings.folders.length > 500) settings.folders.length = 500;
  saveSettings(settings);
}

function syncSavedNames(byId) {
  const settings = readSettings();
  let changed = false;
  for (const folder of settings.folders) {
    const node = byId.get(folder.id);
    if (!node?.children) continue;
    const title = node.title.trim() || "Untitled folder";
    if (title === folder.title) continue;
    folder.title = title;
    changed = true;
  }
  const sections = [];
  for (const section of settings.sections) {
    if (section.id === DEFAULT_SECTION) {
      if (section.title !== "Bookmarks" || section.folderId !== ROOT_ID) {
        section.title = "Bookmarks";
        section.folderId = ROOT_ID;
        changed = true;
      }
      sections.push(section);
      continue;
    }
    const node = byId.get(section.folderId);
    if (!node?.children) {
      changed = true;
      continue;
    }
    const title = node.title.trim() || "Untitled folder";
    if (title !== section.title) {
      section.title = title;
      changed = true;
    }
    sections.push(section);
  }
  const live = new Set(sections.map((section) => section.id));
  const nextFolders = settings.folders.filter((folder) => live.has(folder.sectionId || DEFAULT_SECTION));
  if (nextFolders.length !== settings.folders.length) changed = true;
  if (!changed) return false;
  settings.sections = sections;
  settings.folders = nextFolders;
  writeSettings(settings);
  folders = folderKey(settings);
  sectionsStamp = sectionKey(settings);
  return true;
}

function saveSettings(settings) {
  writeSettings(settings);
  folders = folderKey(settings);
  sectionsStamp = sectionKey(settings);
  notifySettings();
  if (current) paint();
}

function toggleSectionVisible(id) {
  const settings = readSettings();
  const section = sectionById(settings, id);
  if (!section) return;
  section.visible = !section.visible;
  saveSettings(settings);
}

function folderHasSection(folderId) {
  return readSettings().sections.some((section) => section.folderId === folderId);
}

function createSection(folderId) {
  if (!readSettings().sectionsEnabled) return;
  const node = current?.byId.get(folderId);
  if (!node?.children || folderHasSection(folderId)) return;
  const settings = readSettings();
  const name = node.title.trim() || "Untitled folder";
  settings.sections.push({
    id: crypto.randomUUID(),
    folderId,
    visible: true,
    title: name,
  });
  saveSettings(settings);
  const created = settings.sections[settings.sections.length - 1];
  sectionViews.get(created.id)?.panel.scrollIntoView({ block: "nearest" });
}

function removeSection(id) {
  if (id === DEFAULT_SECTION) return;
  const settings = readSettings();
  const index = settings.sections.findIndex((section) => section.id === id);
  if (index < 0) return;
  const section = settings.sections[index];
  const savedFolders = settings.folders.filter((folder) => folder.sectionId === id);
  settings.sections.splice(index, 1);
  settings.folders = settings.folders.filter((folder) => folder.sectionId !== id);
  saveSettings(settings);
  toasts.push({
    message: `Removed section "${section.title}"`,
    onUndo: () => {
      const next = readSettings();
      if (next.sections.some((entry) => entry.id === section.id || entry.folderId === section.folderId)) return;
      next.sections.splice(Math.min(index, next.sections.length), 0, section);
      const have = new Set(next.folders.map((folder) => `${folder.sectionId}:${folder.id}`));
      for (const folder of savedFolders) {
        if (!have.has(`${folder.sectionId}:${folder.id}`)) next.folders.push(folder);
      }
      saveSettings(next);
    },
  });
}

function moveSection(id, beforeId) {
  const settings = readSettings();
  const list = settings.sections;
  const from = list.findIndex((section) => section.id === id);
  if (from < 0) return;
  const nextId = list[from + 1]?.id ?? null;
  if (beforeId === id || beforeId === nextId) return;
  const [item] = list.splice(from, 1);
  let to = beforeId ? list.findIndex((section) => section.id === beforeId) : list.length;
  if (to < 0) to = list.length;
  list.splice(to, 0, item);
  saveSettings(settings);
}

function persistOpen() {
  const ids = new Set(open);
  const run = openWrite.then(() => writeRemembered(readSettings(), ids));
  openWrite = run.then(() => {}, () => {});
  return run;
}

async function applyRemote() {
  const settings = readSettings();
  if (!remembers(settings)) return;
  const ids = await readRemembered(settings);
  if (ids == null || sameIds(ids)) return;
  replaceOpen(ids);
  paint();
}

function memoryKey(settings) {
  return `${settings.remember}:${settings.rememberMinutes}`;
}

function folderKey(settings) {
  return settings.folders.map((folder) => `${folder.sectionId || DEFAULT_SECTION}:${folder.id}:${folder.hidden ? 1 : 0}`).join("\n");
}

function sectionKey(settings) {
  return settings.sections.map((section) => `${section.id}\t${section.folderId}\t${section.visible ? 1 : 0}\t${section.graph ? 1 : 0}\t${section.title}`).join("\n");
}

function replaceOpen(ids) {
  open.clear();
  for (const id of ids) open.add(id);
}

function sameIds(ids) {
  if (ids.length !== open.size) return false;
  return ids.every((id) => open.has(id));
}

function enqueue(work) {
  const run = chain.then(work, work);
  chain = run.then(() => {}, () => {});
  return run;
}

async function bookmarkCurrentPage() {
  if (bookmarkingPage || document.documentElement.dataset.sidePanel !== "on" || !readSettings().showBookmarkPage) return;
  bookmarkingPage = true;
  try {
    if (document.documentElement.dataset.settings === "open") document.querySelector("#settings-close")?.click();
    const page = await readActivePage();
    if (!page) {
      toasts.push({ message: "This page can't be bookmarked." });
      return;
    }
    await enqueue(() => addCurrentPage(page));
  } finally {
    bookmarkingPage = false;
  }
}

async function addCurrentPage(page) {
  if (!current) {
    try {
      current = await pendingTree;
    } catch {
      toasts.push({ message: "Couldn't save that bookmark." });
      return;
    }
  }
  const carried = takeFreshDraft();
  if (carried && folderDraft?.key === carried.id) {
    await commitFolderName(carried.id, carried.value, { fresh: true }, carried.sectionId);
    if (folderDraft) return;
  }
  for (const entry of sectionViews.values()) entry.view.finishLabel();
  const parentId = resolveBookmarkFolder();
  if (!current?.byId.get(parentId)?.children) {
    toasts.push({ message: "Choose a folder for new bookmarks." });
    return;
  }
  let created;
  try {
    created = await mutateBookmarks(() => createBookmark({ parentId, title: page.title, url: page.url }));
  } catch {
    toasts.push({ message: "Couldn't save that bookmark." });
    return;
  }
  if (readSettings().bookmarkUseLastFolder) {
    rememberBookmarkFolder(parentId);
    trackedBookmarkId = created.id;
  }
  openBranch(parentId);
  const sectionId = sectionForNewBookmark(parentId);
  if (!editing) {
    editing = true;
    syncEditing();
    syncSectionsToggle();
  }
  editor.close();
  pendingLabelEdit = { id: created.id, fresh: false, sectionId, value: page.title, scroll: true };
  await persistOpen();
  await refresh();
}

function resolveBookmarkFolder() {
  if (!current) return "";
  return preferredFolderId(listFolders(current.roots), readSettings().bookmarkFolderId);
}

function sectionForNewBookmark(parentId) {
  const settings = readSettings();
  if (!settings.sectionsEnabled) return DEFAULT_SECTION;
  const contains = (section) => section.folderId === ROOT_ID || section.folderId === parentId || nodeInSection(section, parentId);
  const visible = settings.sections.filter((section) => section.visible && contains(section));
  visible.sort((a, b) => folderDepth(b.folderId) - folderDepth(a.folderId));
  if (visible[0]) return visible[0].id;
  const hidden = settings.sections.filter(contains);
  hidden.sort((a, b) => folderDepth(b.folderId) - folderDepth(a.folderId));
  const chosen = hidden[0];
  if (!chosen) return DEFAULT_SECTION;
  showSection(chosen.id);
  return chosen.id;
}

function showSection(sectionId) {
  const settings = readSettings();
  if (!settings.sectionsEnabled) return;
  const section = sectionById(settings, sectionId);
  if (!section || section.visible) return;
  section.visible = true;
  writeSettings(settings);
  sectionsStamp = sectionKey(settings);
  notifySettings();
}

function folderDepth(folderId) {
  if (!folderId || folderId === ROOT_ID) return 0;
  let depth = 0;
  let node = current?.byId.get(folderId);
  while (node?.parentId && node.parentId !== ROOT_ID && depth < 40) {
    depth += 1;
    node = current.byId.get(node.parentId);
  }
  return depth;
}

function openBranch(folderId) {
  let node = current?.byId.get(folderId);
  while (node?.children) {
    open.add(node.id);
    if (!node.parentId || node.parentId === ROOT_ID) break;
    node = current.byId.get(node.parentId);
  }
}

function rememberBookmarkFolder(folderId) {
  if (!readSettings().bookmarkUseLastFolder) return;
  if (!folderId || folderId === ROOT_ID || !current?.byId.get(folderId)?.children) return;
  bookmarkFolderId = folderId;
  const settings = readSettings();
  if (settings.bookmarkFolderId === folderId) return;
  settings.bookmarkFolderId = folderId;
  writeSettings(settings);
  notifySettings();
}

function followTrackedBookmark() {
  if (!trackedBookmarkId || !editing) return;
  const node = current?.byId.get(trackedBookmarkId);
  if (!node || node.children) {
    trackedBookmarkId = "";
    return;
  }
  if (node.parentId) rememberBookmarkFolder(node.parentId);
}

function releaseTrackedBookmark() {
  const id = trackedBookmarkId;
  trackedBookmarkId = "";
  if (!id) return;
  const node = current?.byId.get(id);
  if (!node || node.children || !node.parentId) return;
  rememberBookmarkFolder(node.parentId);
}

function syncEditing() {
  if (!editing) releaseTrackedBookmark();
  if (editing && sectionsToggle.contains(document.activeElement)) editToggle.focus();
  document.documentElement.dataset.editing = editing ? "on" : "off";
  sectionsToggle.hidden = editing || !sectionsEnabled;
  const railStays = sectionsEnabled && (editing || sectionsPinned() || sectionPeekActive());
  if (!railStays && rail.contains(document.activeElement)) {
    if (sectionsEnabled) sectionsToggle.focus();
    else editToggle.focus();
  }
  editToggle.setAttribute("aria-pressed", editing ? "true" : "false");
  const label = editing ? "Done editing" : "Edit bookmarks";
  editToggle.title = label;
  const hiddenLabel = editToggle.querySelector(".visually-hidden");
  if (hiddenLabel) hiddenLabel.textContent = label;
  searchForm.hidden = editing;
  editBanner.hidden = !editing;
  if (!editing) {
    editor.close();
    sectionNew.hidden = true;
    sectionNew.classList.remove("is-armed");
  }
}

function onSectionPointer(event) {
  if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
  sectionPointerX = event.clientX;
  sectionPointerY = event.clientY;
  syncSectionsToggle();
}

function releaseSectionPointer() {
  if (!sectionHolding) return;
  sectionHolding = false;
  syncSectionsToggle();
}

function sectionsFitOnLeft() {
  // Hypothetical side-by-side sizes, not the live boxes: measuring the current
  // column would flip the layout back and forth as it grows and shrinks.
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const panelMax = 38 * rem;
  const railRight = 16 + 11.5 * rem;
  const gap = 28;
  const pad = 24;
  const content = window.innerWidth - pad * 2;
  const column = Math.min(panelMax, Math.max(0, content));
  const columnLeft = pad + (content - column) / 2;
  return columnLeft >= railRight + gap;
}

function syncSectionRailSpace() {
  const top = document.documentElement.dataset.sectionsPlace === "top";
  const open = document.documentElement.dataset.sectionsOpen === "on";
  const hold = topCollapse === 0 && top && (open || rail.classList.contains("is-sliding"));
  const block = hold ? Math.ceil(rail.getBoundingClientRect().height) + 12 : 0;
  const next = `${block}px`;
  if (document.documentElement.style.getPropertyValue("--section-rail-block") !== next) {
    document.documentElement.style.setProperty("--section-rail-block", next);
  }
}

// Grow or shrink the pinned list's gap. If the scroll position is already past
// that gap, move the scroll by the same amount so the bookmarks stay put.
function shiftRailSpace(block) {
  const pageEl = document.querySelector(".page");
  const next = `${block}px`;
  if (!pageEl || document.documentElement.dataset.sectionsPlace !== "top") {
    document.documentElement.style.setProperty("--section-rail-block", next);
    return;
  }
  const previous = document.documentElement.style.getPropertyValue("--section-rail-block") || "0px";
  const before = parseFloat(getComputedStyle(pageEl).paddingTop);
  const scrollBefore = window.scrollY;
  document.documentElement.dataset.sectionsAnchor = "on";
  pageEl.getBoundingClientRect();
  document.documentElement.style.setProperty("--section-rail-block", next);
  const delta = Math.round(parseFloat(getComputedStyle(pageEl).paddingTop) - before);
  if (delta !== 0 && scrollBefore > Math.abs(delta)) {
    window.scrollTo(0, scrollBefore + delta);
    requestAnimationFrame(() => {
      delete document.documentElement.dataset.sectionsAnchor;
    });
    return;
  }
  document.documentElement.style.setProperty("--section-rail-block", previous);
  pageEl.getBoundingClientRect();
  delete document.documentElement.dataset.sectionsAnchor;
  if (previous === next) return;
  document.documentElement.dataset.railSpacing = "on";
  pageEl.getBoundingClientRect();
  document.documentElement.style.setProperty("--section-rail-block", next);
  const stopSpacing = (event) => {
    if (event.target !== pageEl || event.propertyName !== "padding-top") return;
    delete document.documentElement.dataset.railSpacing;
    pageEl.removeEventListener("transitionend", stopSpacing);
  };
  pageEl.addEventListener("transitionend", stopSpacing);
  window.setTimeout(() => {
    delete document.documentElement.dataset.railSpacing;
    pageEl.removeEventListener("transitionend", stopSpacing);
  }, 260);
}

function syncSectionsPlace() {
  const place = sectionsFitOnLeft() ? "side" : "top";
  if (place === document.documentElement.dataset.sectionsPlace) return false;
  document.documentElement.dataset.sectionsPlace = place;
  syncSectionRailSpace();
  return true;
}

function sectionPeekActive() {
  if (document.documentElement.dataset.sectionsPlace === "top") return false;
  if (!sectionsEnabled || !revealSections || sectionsPinned()) return false;
  if (sectionHolding) return true;
  if (sectionPointerX == null) return false;
  const width = window.innerWidth || 1;
  const edge = width * 0.25;
  if (sectionPointerX <= edge) return true;
  if (sectionsShown && sectionPointerX <= edge + 32) return true;
  const box = rail.getBoundingClientRect();
  return sectionPointerX >= box.left && sectionPointerX <= box.right && sectionPointerY >= box.top && sectionPointerY <= box.bottom;
}

function sectionsPinned() {
  return document.documentElement.dataset.sections !== "off";
}

function syncSectionsToggle() {
  const pinned = sectionsPinned();
  const open = sectionsEnabled && (editing || pinned || sectionPeekActive());
  document.documentElement.dataset.multiSections = sectionsEnabled ? "on" : "off";
  sectionsToggle.hidden = editing || !sectionsEnabled;
  if (!sectionsEnabled) {
    sectionNew.hidden = true;
    sectionNew.classList.remove("is-armed");
  }
  const pressed = pinned ? "true" : "false";
  if (sectionsToggle.getAttribute("aria-pressed") !== pressed) {
    sectionsToggle.setAttribute("aria-pressed", pressed);
    const label = pinned ? "Hide sections" : "Show sections";
    sectionsToggle.title = label;
    const hiddenLabel = sectionsToggle.querySelector(".visually-hidden");
    if (hiddenLabel) hiddenLabel.textContent = label;
  }
  if (sectionsShown !== null && open === sectionsShown) return;
  // Enable the slide before the translate changes, then commit that start
  // position. Otherwise the buttons jump instead of coming in from the side.
  if (sectionsShown !== null) {
    rail.classList.add("is-sliding");
    railList.getBoundingClientRect();
  }
  // The pinned list slides away while the page eases back up into the gap.
  if (sectionsShown && !open && document.documentElement.dataset.sectionsPlace === "top") {
    sectionsShown = false;
    topCollapse += 1;
    shiftRailSpace(0);
    document.documentElement.dataset.sectionsOpen = "off";
    rail.inert = true;
    rail.toggleAttribute("aria-hidden", true);
    playSectionSlide();
    return;
  }
  topCollapse = 0;
  document.documentElement.dataset.sectionsOpen = open ? "on" : "off";
  rail.inert = !open;
  rail.toggleAttribute("aria-hidden", !open);
  if (sectionsShown === null) {
    sectionsShown = open;
    syncSectionRailSpace();
    return;
  }
  const wasShown = sectionsShown;
  sectionsShown = open;
  playSectionSlide();
  if (!wasShown && open && document.documentElement.dataset.sectionsPlace === "top") {
    shiftRailSpace(Math.ceil(rail.getBoundingClientRect().height) + 12);
  } else syncSectionRailSpace();
}

function playSectionSlide() {
  const generation = ++sectionSlide;
  const collapse = topCollapse;
  rail.classList.add("is-sliding");
  const items = [...railList.querySelectorAll(".section-rail-item")];
  let pending = items.length;
  const endSlide = () => {
    rail.classList.remove("is-sliding");
    if (topCollapse === collapse) topCollapse = 0;
    syncSectionRailSpace();
  };
  const finish = () => {
    if (generation !== sectionSlide || pending < 0) return;
    pending -= 1;
    if (pending > 0) return;
    endSlide();
  };
  for (const item of items) {
    item.addEventListener("transitionend", (event) => {
      if (event.target !== item || event.propertyName !== "translate") return;
      finish();
    }, { once: true });
  }
  window.setTimeout(() => {
    if (generation !== sectionSlide) return;
    endSlide();
  }, 420 + Math.max(items.length - 1, 0) * 50 + 120);
}

function reveal(id, stopId = ROOT_ID) {
  let node = current?.byId.get(id);
  while (node?.parentId && node.parentId !== ROOT_ID && node.parentId !== stopId) {
    open.add(node.parentId);
    node = current.byId.get(node.parentId);
  }
}

function keepOpen(parentId) {
  if (parentId && parentId !== ROOT_ID) open.add(parentId);
}

function currentLabelDraft() {
  for (const entry of sectionViews.values()) {
    const draft = entry.view.labelDraft();
    if (draft) return { ...draft, sectionId: entry.id };
  }
  return null;
}

function editLabelSoon(edit) {
  const entry = sectionViews.get(edit.sectionId) ?? sectionViews.get(pickSection(edit.sectionId, edit.id));
  if (!entry) return;
  let frames = 0;
  const step = () => {
    if (entry.view.editFolderLabel(edit.id, edit)) {
      if (pendingLabelEdit?.id === edit.id) pendingLabelEdit = null;
      return;
    }
    if (frames >= (edit.scroll ? 180 : 40)) return;
    frames += 1;
    requestAnimationFrame(step);
  };
  step();
}

function focusSoon(sectionId, id) {
  const picked = pickSection(sectionId, id);
  const entry = sectionViews.get(picked);
  if (!entry) return;
  let frames = 0;
  const step = () => {
    if ((entry.graphShown ? entry.graph : entry.view).focus(id)) {
      document.activeElement?.scrollIntoView?.({ block: "nearest" });
      return;
    }
    if (frames >= 40) return;
    frames += 1;
    requestAnimationFrame(step);
  };
  step();
}

function sectionIdFrom(element) {
  return element?.closest?.("[data-section-id]")?.dataset.sectionId || DEFAULT_SECTION;
}

function createIn(parentId, kind, anchor) {
  const sectionId = sectionIdFrom(anchor);
  formSection = sectionId;
  if (kind === "folder") {
    editor.close();
    void enqueue(() => createFolderInline(parentId, sectionId));
    return;
  }
  editor.openForm({
    heading: "New bookmark",
    kind: "bookmark",
    name: "",
    url: "",
    submitLabel: "Add",
    anchor,
    onSubmit: (values) => enqueue(() => createNode(parentId, "bookmark", values, sectionId)),
  });
}

function addNode(id, anchor) {
  const node = current?.byId.get(id);
  if (!node?.children) return;
  const sectionId = sectionIdFrom(anchor);
  formSection = sectionId;
  if (editor.isAnchoredTo(anchor)) {
    editor.close();
    return;
  }
  editor.openMenu(anchor, (kind) => {
    if (kind === "folder") {
      editor.close();
      void enqueue(() => createFolderInline(id, sectionId));
      return;
    }
    editor.openForm({
      heading: "New bookmark",
      kind: "bookmark",
      name: "",
      url: "",
      submitLabel: "Add",
      anchor,
      onSubmit: (values) => enqueue(() => createNode(id, "bookmark", values, sectionId)),
    });
  });
}

async function createFolderInline(parentId, sectionId) {
  const carried = takeFreshDraft();
  if (carried && folderDraft?.key === carried.id) {
    await commitFolderName(carried.id, carried.value, { fresh: true }, carried.sectionId);
    if (folderDraft) return;
  }
  folderDraft = {
    key: `draft:${crypto.randomUUID()}`,
    parentId,
    sectionId,
  };
  pendingLabelEdit = { id: folderDraft.key, fresh: true, sectionId, value: "" };
  paint();
}

function editNode(id, anchor) {
  const node = current?.byId.get(id);
  if (!node || isPermanent(node.id)) return;
  const sectionId = sectionIdFrom(anchor);
  formSection = sectionId;
  if (editor.isAnchoredTo(anchor)) {
    editor.close();
    return;
  }
  const folder = Boolean(node.children);
  if (folder) {
    editor.close();
    sectionViews.get(sectionId)?.view.editFolderLabel(id);
    return;
  }
  editor.openForm({
    heading: "Edit bookmark",
    kind: "bookmark",
    name: node.title,
    url: node.url ?? "",
    submitLabel: "Save",
    anchor,
    onSubmit: (values) => enqueue(() => saveNode(id, false, values, sectionId)),
  });
}

async function createNode(parentId, kind, { title, url }, sectionId) {
  try {
    const created = await createBookmark({
      parentId,
      title,
      url: kind === "bookmark" ? url : undefined,
    });
    keepOpen(parentId);
    pendingFocus = { sectionId, id: created.id };
    await persistOpen();
    await refresh();
  } catch {
    throw new Error("Couldn't save that.");
  }
}

async function commitFolderName(id, title, { fresh }, sectionId) {
  if (fresh && folderDraft?.key === id) {
    const parentId = folderDraft.parentId;
    try {
      const created = await mutateBookmarks(() => createBookmark({ parentId, title }));
      clearFolderDraft();
      keepOpen(parentId);
      pendingFocus = { sectionId, id: created.id };
      await persistOpen();
      await refresh();
    } catch {
      pendingLabelEdit = { id, fresh: true, sectionId, value: title };
      toasts.push({ message: "Couldn't save that folder." });
      paint();
    }
    return;
  }
  const node = current?.byId.get(id);
  if (!node || isPermanent(node.id)) return;
  if (!fresh && title === (node.title ?? "").trim()) return;
  const folder = Boolean(node.children);
  try {
    await updateBookmark(id, { title });
    pendingFocus = { sectionId, id };
    await refresh();
  } catch {
    toasts.push({ message: folder ? "Couldn't rename that folder." : "Couldn't rename that bookmark." });
    await refresh();
  }
}

async function cancelFolderName(id, { fresh }) {
  if (!fresh) return;
  if (folderDraft?.key === id) {
    clearFolderDraft();
    paint();
    return;
  }
  pendingLabelEdit = null;
  try {
    await removeBookmark(id, true);
  } catch {
    toasts.push({ message: "Couldn't save that." });
  }
  await refresh();
}

async function saveNode(id, folder, { title, url }, sectionId = formSection) {
  try {
    await updateBookmark(id, folder ? { title } : { title, url });
    pendingFocus = { sectionId, id };
    await refresh();
  } catch {
    throw new Error("Couldn't save that.");
  }
}

async function deleteNode(id, fromKeyboard, sectionId = DEFAULT_SECTION) {
  const node = current?.byId.get(id);
  if (!node || isPermanent(node.id)) return;
  const siblings = node.parentId === ROOT_ID ? current.roots : current.byId.get(node.parentId)?.children;
  const index = siblings?.findIndex((child) => child.id === id) ?? 0;
  const snapshot = cloneSubtree(node);
  const label = itemLabel(node);
  const parentId = node.parentId;
  const folder = Boolean(node.children);
  editor.close();
  if (fromKeyboard) sectionViews.get(sectionId)?.view.focusNeighbor(id);
  try {
    await removeBookmark(id, folder);
  } catch {
    toasts.push({ message: "Couldn't delete that." });
    return;
  }
  toasts.push({
    message: folder ? `Deleted folder "${label}"` : `Deleted "${label}"`,
    onUndo: () => enqueue(() => restoreNode(snapshot, parentId, index, sectionId)),
  });
}

async function restoreNode(snapshot, parentId, index, sectionId) {
  if (parentId !== ROOT_ID && !current?.byId.has(parentId)) throw new Error("Couldn't undo that.");
  try {
    let createdId = "";
    await mutateBookmarks(async () => {
      createdId = await recreate(snapshot, parentId, index);
      keepOpen(parentId);
      pendingFocus = { sectionId, id: createdId };
      await persistOpen();
    });
    await refresh();
  } catch {
    await refresh();
    throw new Error("Couldn't undo that.");
  }
}

async function recreate(snapshot, parentId, index) {
  const created = await createBookmark({
    parentId,
    title: snapshot.title,
    url: snapshot.children ? undefined : snapshot.url,
    index,
  });
  if (snapshot.children) {
    keepOpen(created.id);
    for (const child of snapshot.children) await recreate(child, created.id);
  }
  return created.id;
}

async function moveNode(id, { parentId, beforeId }, sectionId) {
  const node = current?.byId.get(id);
  const siblings = parentId === ROOT_ID ? current.roots : current?.byId.get(parentId)?.children;
  if (!node || isPermanent(node.id) || !siblings) return;
  if (id === parentId || nodeIsInside(current.byId, parentId, id)) return;
  const index = indexForMove(siblings, beforeId);
  if (node.parentId === parentId) {
    const oldIndex = siblings.findIndex((child) => child.id === id);
    if (isNoopMove(oldIndex, index)) return;
  }
  try {
    await moveBookmark(id, { parentId, index });
  } catch {
    toasts.push({ message: "Couldn't move that." });
    return;
  }
  if (id === trackedBookmarkId) rememberBookmarkFolder(parentId);
  keepOpen(parentId);
  pendingFocus = { sectionId, id };
  await persistOpen();
  await refresh();
}
