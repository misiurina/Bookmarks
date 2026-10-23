function iconTemplate(markup, viewBox = "0 0 16 16", width = 16, height = 16) {
  const template = document.createElement("template");
  template.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" aria-hidden="true" focusable="false">${markup}</svg>`;
  return template;
}

const chevronTemplate = iconTemplate(
  '<path d="M6 3.2 10.8 8 6 12.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
);

const folderTemplate = iconTemplate(
  '<path fill="currentColor" d="M2 4.7c0-.9.7-1.6 1.6-1.6h2.2l1.1 1.35h5.5c.9 0 1.6.7 1.6 1.6v6.15c0 .9-.7 1.6-1.6 1.6H3.6c-.9 0-1.6-.7-1.6-1.6V4.7z"/>',
);

const eyeTemplate = iconTemplate(
  '<path d="M1.2 8c1.7-2.7 3.6-4 6.8-4s5.1 1.3 6.8 4c-1.7 2.7-3.6 4-6.8 4s-5.1-1.3-6.8-4z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.7" fill="currentColor"/>',
);

const eyeOffTemplate = iconTemplate(
  '<path d="M1.2 8c1.7-2.7 3.6-4 6.8-4s5.1 1.3 6.8 4c-1.7 2.7-3.6 4-6.8 4s-5.1-1.3-6.8-4z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.7" fill="currentColor"/><path d="M3.2 12.8 12.8 3.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
);

const expandAllTemplate = iconTemplate(
  '<path d="M4.2 4.6 8 8.2 11.8 4.6M4.2 8.4 8 12 11.8 8.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
);

const collapseAllTemplate = iconTemplate(
  '<path d="M4.2 7.4 8 3.8 11.8 7.4M4.2 11.2 8 7.6 11.8 11.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
);

const headerExpandTemplate = iconTemplate(
  '<path d="M4.6 2.7 10.5 7.6 16.4 2.7M4.6 9.3 10.5 14.2 16.4 9.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  "0 0 21 18",
  21,
  18,
);

const headerCollapseTemplate = iconTemplate(
  '<path d="M4.6 7.6 10.5 2.7 16.4 7.6M4.6 14.2 10.5 9.3 16.4 14.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  "0 0 21 18",
  21,
  18,
);

const closeTemplate = iconTemplate(
  '<path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
);

const schemeCheckTemplate = iconTemplate(
  '<circle cx="8" cy="8" r="8" fill="currentColor"/><path d="M4.4 8.15 6.85 10.5 11.6 5.6" fill="none" stroke="var(--scheme-check-ink)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
);

const chevronDownTemplate = iconTemplate(
  '<path d="M3.2 6 8 10.8 12.8 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
);

const pencilTemplate = iconTemplate(
  '<path d="M9.3 2.7a1.15 1.15 0 0 1 1.6 0l2.4 2.4a1.15 1.15 0 0 1 0 1.6L6.1 13.9 2.2 14.8l.9-3.9z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8.5 3.7 12.3 7.5" fill="none" stroke="currentColor" stroke-width="1.3"/>',
);

const trashTemplate = iconTemplate(
  '<path d="M3.1 4.6h9.8M6.1 4.5V3h3.8v1.5M4.3 4.6l.55 8.1h6.3l.55-8.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>',
);

const plusTemplate = iconTemplate(
  '<path d="M8 3.2v9.6M3.2 8h9.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
);

const folderPlusTemplate = iconTemplate(
  '<path fill="currentColor" transform="translate(-0.45 -0.7) scale(0.9)" d="M2 4.7c0-.9.7-1.6 1.6-1.6h2.2l1.1 1.35h5.5c.9 0 1.6.7 1.6 1.6v6.15c0 .9-.7 1.6-1.6 1.6H3.6c-.9 0-1.6-.7-1.6-1.6V4.7z"/><circle cx="12.15" cy="12.15" r="4.15" fill="var(--bg)"/><path d="M12.15 10.05v4.2M10.05 12.15h4.2" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/>',
);

const bookmarkPlusTemplate = iconTemplate(
  '<path fill="currentColor" transform="translate(0.15 -0.25) scale(0.84)" d="M3.6 1.5h8.8A1.1 1.1 0 0 1 13.5 2.6V14.5L8 11.2 2.5 14.5V2.6A1.1 1.1 0 0 1 3.6 1.5z"/><circle cx="12.15" cy="12.15" r="4.15" fill="var(--bg)"/><path d="M12.15 10.05v4.2M10.05 12.15h4.2" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/>',
);

const globeTemplate = iconTemplate(
  '<circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 2.8c1.55 1.65 1.55 8.75 0 10.4M8 2.8C6.45 4.45 6.45 11.55 8 13.2M2.9 8h10.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
);

function stamp(template, className) {
  const svg = template.content.firstElementChild.cloneNode(true);
  svg.classList.add(className);
  return svg;
}

function wrap(node, className) {
  const slot = document.createElement("span");
  slot.className = className;
  slot.setAttribute("aria-hidden", "true");
  if (node) slot.append(node);
  return slot;
}

export function chevronSlot() {
  return wrap(stamp(chevronTemplate, "chevron-svg"), "chevron");
}

export function folderSlot() {
  return wrap(stamp(folderTemplate, "folder-svg"), "glyph folder-icon");
}

export function globeSlot() {
  return wrap(stamp(globeTemplate, "globe-svg"), "glyph globe-icon");
}

export function chevronSpacer() {
  return wrap(null, "chevron");
}

export function globeSvg() {
  return stamp(globeTemplate, "globe-svg");
}

export function expandAllIcon() {
  return stamp(expandAllTemplate, "branch-svg");
}

export function collapseAllIcon() {
  return stamp(collapseAllTemplate, "branch-svg");
}

export function headerExpandIcon() {
  return stamp(headerExpandTemplate, "branch-svg");
}

export function headerCollapseIcon() {
  return stamp(headerCollapseTemplate, "branch-svg");
}

export function eyeIcon() {
  return stamp(eyeTemplate, "eye-svg");
}

export function eyeOffIcon() {
  return stamp(eyeOffTemplate, "eye-svg");
}

export function closeIcon() {
  return stamp(closeTemplate, "close-svg");
}

export function schemeCheckIcon() {
  return stamp(schemeCheckTemplate, "scheme-check");
}

export function chevronDownIcon() {
  return stamp(chevronDownTemplate, "schemes-chevron");
}

export function pencilIcon() {
  return stamp(pencilTemplate, "pencil-svg");
}

export function trashIcon() {
  return stamp(trashTemplate, "trash-svg");
}

export function plusIcon() {
  return stamp(plusTemplate, "plus-svg");
}

export function folderPlusIcon() {
  return stamp(folderPlusTemplate, "folder-plus-svg");
}

export function bookmarkPlusIcon() {
  return stamp(bookmarkPlusTemplate, "bookmark-plus-svg");
}
