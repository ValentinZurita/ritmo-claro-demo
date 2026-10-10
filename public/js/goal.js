// File map: edits the runner's goal and refreshes its summary.

import { goalStore } from "./data/goal-store.js";
import { formatPace } from "./data/format.js";

const $ = (id) => document.getElementById(id);
const modal = $("goalModal");

function formatDistance(distanceKm) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(
    distanceKm,
  );
}

function renderGoal() {
  const goal = goalStore.getGoal();
  const hours = Math.floor(goal.durationMinutes / 60);
  const minutes = Math.round(goal.durationMinutes % 60);
  const duration = hours
    ? `${hours} h${minutes ? ` ${minutes} min` : ""}`
    : `${minutes} min`;
  $("goalTitle").textContent =
    `${formatDistance(goal.distanceKm)} km en menos de ${duration}`;
  $("goalDate").textContent = new Date(
    `${goal.date}T12:00:00`,
  ).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  $("targetPace").innerHTML =
    `${formatPace(goal.durationMinutes / goal.distanceKm)}<span>ritmo objetivo por km</span>`;
}

function openGoalEditor() {
  const goal = goalStore.getGoal();
  $("goalDistance").value = String(goal.distanceKm);
  $("goalHours").value = String(Math.floor(goal.durationMinutes / 60));
  $("goalMinutes").value = String(Math.round(goal.durationMinutes % 60));
  $("goalDateInput").value = goal.date;
  modal.classList.add("open");
  $("goalDistance").focus();
}

function closeGoalEditor() {
  modal.classList.remove("open");
}

$("editGoal").addEventListener("click", openGoalEditor);
$("closeGoal").addEventListener("click", closeGoalEditor);
$("cancelGoal").addEventListener("click", closeGoalEditor);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeGoalEditor();
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
    $("goalMinutes").setCustomValidity("El tiempo debe ser mayor que cero.");
    $("goalMinutes").reportValidity();
    return;
  }
  $("goalMinutes").setCustomValidity("");
  goalStore.saveGoal({
    distanceKm,
    durationMinutes,
    date: $("goalDateInput").value,
  });
  closeGoalEditor();
});

window.addEventListener("ritmo-goal-updated", renderGoal);
renderGoal();
