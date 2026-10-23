const MINUTE = 60 * 1000;

export function remembers(settings) {
  return settings.remember !== "off";
}

export function rememberWindowMs(settings) {
  if (settings.remember === "off" || settings.remember === "session" || settings.remember === "forever") return null;
  const minutes = settings.remember === "custom" ? Number(settings.rememberMinutes) : Number(settings.remember);
  if (!Number.isInteger(minutes) || minutes < 1) return 0;
  return minutes * MINUTE;
}

export function freshExpanded(record, settings, now = Date.now()) {
  if (!record || settings.remember === "off") return null;
  if (settings.remember === "forever" || settings.remember === "session") return record.expanded;
  const windowMs = rememberWindowMs(settings);
  if (windowMs == null || typeof record.savedAt !== "number") return null;
  if (now - record.savedAt > windowMs) return null;
  return record.expanded;
}
