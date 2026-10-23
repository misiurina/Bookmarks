import { normalizeUrl } from "../bookmarks/ops.js";

export function mountEditor(popover) {
  const menu = popover.querySelector("#edit-menu");
  const form = popover.querySelector("#edit-form");
  const heading = popover.querySelector("#edit-popover-title");
  const urlField = popover.querySelector("#edit-url-field");
  const error = popover.querySelector("#edit-error");
  const cancel = popover.querySelector("#edit-cancel");
  const save = popover.querySelector("#edit-save");
  let anchor = null;
  let onSubmit = null;
  let chooseKind = null;
  let open = false;
  let saving = false;

  menu.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || !menu.contains(button)) return;
    const choose = chooseKind;
    chooseKind = null;
    choose?.(button.dataset.kind);
  });
  menu.addEventListener("keydown", (event) => {
    const buttons = [...menu.querySelectorAll("button")];
    const index = buttons.indexOf(document.activeElement);
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit();
  });
  cancel.addEventListener("click", close);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onPointer, true);
  document.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", close);

  function openMenu(nextAnchor, choose) {
    anchor = nextAnchor;
    onSubmit = null;
    saving = false;
    chooseKind = choose;
    menu.hidden = false;
    form.hidden = true;
    popover.setAttribute("aria-label", "Add");
    popover.removeAttribute("aria-labelledby");
    show(nextAnchor);
    menu.querySelector("button")?.focus({ preventScroll: true });
  }

  function openForm({ heading: title, kind, name, url, submitLabel, anchor: nextAnchor, onSubmit: submitHandler }) {
    anchor = nextAnchor ?? anchor;
    onSubmit = submitHandler;
    menu.hidden = true;
    chooseKind = null;
    form.hidden = false;
    form.dataset.kind = kind;
    heading.textContent = title;
    popover.removeAttribute("aria-label");
    popover.setAttribute("aria-labelledby", "edit-popover-title");
    form.elements.title.value = name ?? "";
    form.elements.url.value = url ?? "";
    urlField.hidden = kind !== "bookmark";
    error.hidden = true;
    error.textContent = "";
    save.textContent = submitLabel;
    save.disabled = false;
    show(anchor);
    form.elements.title.focus({ preventScroll: true });
    if (name) form.elements.title.select();
  }

  function show(nextAnchor) {
    open = true;
    popover.style.visibility = "hidden";
    popover.hidden = false;
    const margin = 8;
    const rect = nextAnchor.getBoundingClientRect();
    const box = popover.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + box.width > window.innerWidth - margin) left = window.innerWidth - box.width - margin;
    if (left < margin) left = margin;
    if (top + box.height > window.innerHeight - margin) top = Math.max(margin, rect.top - box.height - 6);
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
    popover.style.visibility = "";
  }

  function close() {
    if (!open) return;
    open = false;
    anchor = null;
    onSubmit = null;
    chooseKind = null;
    saving = false;
    popover.hidden = true;
  }

  async function submit() {
    if (saving) return;
    const kind = form.dataset.kind;
    const title = form.elements.title.value.trim();
    let url = "";
    if (kind === "bookmark") {
      url = normalizeUrl(form.elements.url.value);
      if (!url || !validUrl(url)) {
        showError("Enter a valid address.");
        form.elements.url.focus();
        return;
      }
    }
    const submitHandler = onSubmit;
    if (!submitHandler) return;
    saving = true;
    save.disabled = true;
    try {
      await submitHandler({ title, url });
      close();
    } catch (error) {
      saving = false;
      save.disabled = false;
      showError(error?.message || "Couldn't save that.");
    }
  }

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  function onKey(event) {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  function onScroll(event) {
    if (!open || popover.contains(event.target)) return;
    close();
  }

  function onPointer(event) {
    if (!open) return;
    if (popover.contains(event.target)) return;
    if (event.target instanceof Element && event.target.closest(".add-item, .edit-item, .tree-add button")) return;
    close();
  }

  return {
    openMenu,
    openForm,
    close,
    isOpen: () => open,
    isAnchoredTo: (node) => open && anchor === node,
  };
}

function validUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
