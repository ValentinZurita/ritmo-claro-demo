// File map: shared date and pace formatting for application features.

import { appLocale } from "../i18n.js";

export function formatPace(value) {
  if (!Number.isFinite(value)) return "—";
  let minutes = Math.floor(value),
    seconds = Math.round((value - minutes) * 60);
  if (seconds === 60) {
    minutes++;
    seconds = 0;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDate(value) {
  return new Date(value + "T12:00:00").toLocaleDateString(appLocale, {
    day: "numeric",
    month: "short",
  });
}
