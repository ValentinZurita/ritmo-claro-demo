// File map: edits the runner's goal and refreshes its summary.

import { goalStore } from "./data/goal-store.js";
import { formatPace } from "./data/format.js";
import { appLocale, isEnglish, t } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const modal = $("goalModal");
let firstRun = false;

function formatDistance(distanceKm) {
  return new Intl.NumberFormat(appLocale, { maximumFractionDigits: 1 }).format(
    distanceKm,
  );
}

function renderGoal() {
  const goal = goalStore.getGoal();
  const hours = Math.floor(goal.durationMinutes / 60);
  const minutes = Math.round(goal.durationMinutes % 60);
  const duration = hours
    ? `${hours} ${isEnglish ? "hr" : "h"}${minutes ? ` ${minutes} min` : ""}`
    : `${minutes} min`;
  $("goalTitle").textContent = isEnglish
    ? `${formatDistance(goal.distanceKm)} km in under ${duration}`
    : `${formatDistance(goal.distanceKm)} km en menos de ${duration}`;
  $("goalDate").textContent = new Date(
    `${goal.date}T12:00:00`,
  ).toLocaleDateString(appLocale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  $("targetPace").innerHTML =
    `${formatPace(goal.durationMinutes / goal.distanceKm)}<span>ritmo objetivo por km</span>`;
}

export function openGoalEditor({ firstRun: isFirstRun = false } = {}) {
  firstRun = isFirstRun;
  if (firstRun) {
    $("goalDistance").value = "";
    $("goalHours").value = "";
    $("goalMinutes").value = "";
    $("goalDateInput").value = "";
  } else {
    const goal = goalStore.getGoal();
    $("goalDistance").value = String(goal.distanceKm);
    $("goalHours").value = String(Math.floor(goal.durationMinutes / 60));
    $("goalMinutes").value = String(Math.round(goal.durationMinutes % 60));
    $("goalDateInput").value = goal.date;
  }
  modal.classList.toggle("is-first-run", firstRun);
  $("goalModalTitle").textContent = firstRun
    ? t("¿Cuál es tu meta?")
    : t("Tu meta de running");
  $("saveGoal").textContent = firstRun ? t("Continuar") : t("Guardar meta");
  modal.classList.add("open");
  $("goalDistance").focus();
}

// The first-run goal cannot be dismissed until it is saved; the run flow depends on it.
function closeGoalEditor({ saved = false } = {}) {
  if (firstRun && !saved) return;
  firstRun = false;
  modal.classList.remove("open", "is-first-run");
  if (!saved) window.dispatchEvent(new Event("ritmo-goal-editor-closed"));
}

$("editGoal").addEventListener("click", () => openGoalEditor());
$("closeGoal").addEventListener("click", closeGoalEditor);
$("cancelGoal").addEventListener("click", closeGoalEditor);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeGoalEditor();
  const chip = event.target.closest("[data-km]");
  if (!chip) return;
  $("goalDistance").value = chip.dataset.km;
  $("goalHours").focus();
});
modal.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeGoalEditor();
});
$("goalForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const distanceKm = Number($("goalDistance").value);
  const durationMinutes =
    Number($("goalHours").value) * 60 + Number($("goalMinutes").value);
  if (durationMinutes <= 0) {
    $("goalMinutes").setCustomValidity(
      isEnglish
        ? "Time must be greater than zero."
        : "El tiempo debe ser mayor que cero.",
    );
    $("goalMinutes").reportValidity();
    return;
  }
  $("goalMinutes").setCustomValidity("");
  goalStore.saveGoal({
    distanceKm,
    durationMinutes,
    date: $("goalDateInput").value,
  });
  closeGoalEditor({ saved: true });
  window.dispatchEvent(new Event("ritmo-goal-saved"));
});

window.addEventListener("ritmo-goal-updated", renderGoal);
renderGoal();
