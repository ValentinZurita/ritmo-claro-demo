// File map: first-time Google Drive goal and first-run steps, using existing modals.

import { goalStore } from "./data/goal-store.js";

const $ = (id) => document.getElementById(id);
let active = false;
let waitingForGoal = false;
let waitingForRun = false;

function showOnboarding() {
  const modal = $("onboardingModal");
  if (!modal) return;
  modal.hidden = false;
  modal.classList.add("open");
}

function hideOnboarding() {
  const modal = $("onboardingModal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.hidden = true;
}

function showGoalStep() {
  $("onboardingStepGoal").hidden = false;
  $("onboardingStepRuns").hidden = true;
  $("onboardingTitle").textContent = "Tu meta";
  $("onboardingLead").textContent =
    "Distancia, tiempo y fecha. La meta da contexto; no crea un plan.";
}

function showRunsStep() {
  $("onboardingStepGoal").hidden = true;
  $("onboardingStepRuns").hidden = false;
  $("onboardingTitle").textContent = "Tus primeras carreras";
  $("onboardingLead").textContent =
    "Anota una, sube un CSV, o déjalo para después.";
}

function finishOnboarding() {
  if (!active) return;
  active = false;
  waitingForGoal = false;
  waitingForRun = false;
  goalStore.setOnboardingComplete(true);
  hideOnboarding();
  window.dispatchEvent(new Event("ritmo-onboarding-done"));
}

export function startOnboarding() {
  active = true;
  document.body.classList.add("is-booting");
  if (goalStore.hasGoal()) showRunsStep();
  else showGoalStep();
  showOnboarding();
}

function openGoal() {
  waitingForGoal = true;
  import("./goal.js").then((mod) => mod.openGoalEditor());
}

function openRun() {
  waitingForRun = true;
  import("./demo-data.js").then((mod) => mod.openRunEditor());
}

function openCsv() {
  waitingForRun = true;
  import("./csv-import.js").then((mod) => mod.openCsvImporter());
}

$("onboardingDefineGoal")?.addEventListener("click", openGoal);
$("onboardingAddRun")?.addEventListener("click", openRun);
$("onboardingCsv")?.addEventListener("click", openCsv);
$("onboardingSkip")?.addEventListener("click", finishOnboarding);
$("onboardingModal")?.addEventListener("click", (event) => {
  if (event.target === $("onboardingModal")) return;
});

window.addEventListener("ritmo-goal-saved", () => {
  if (!active || !waitingForGoal) return;
  waitingForGoal = false;
  showRunsStep();
  showOnboarding();
});

window.addEventListener("ritmo-goal-editor-closed", () => {
  if (!active) return;
  showOnboarding();
});

window.addEventListener("ritmo-run-saved", () => {
  if (!active || !waitingForRun) return;
  finishOnboarding();
});

window.addEventListener("ritmo-run-editor-closed", () => {
  if (!active) return;
  showOnboarding();
});

window.addEventListener("ritmo-csv-imported", () => {
  if (!active || !waitingForRun) return;
  finishOnboarding();
});

window.addEventListener("ritmo-csv-closed", () => {
  if (!active) return;
  showOnboarding();
});

window.addEventListener("ritmo-start-onboarding", startOnboarding);
