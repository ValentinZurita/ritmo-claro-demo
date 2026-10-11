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
  $("onboardingAddRun")?.focus();
}

function hideOnboarding() {
  const modal = $("onboardingModal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.hidden = true;
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
  if (goalStore.hasGoal()) showOnboarding();
  else openGoal();
}

function openGoal() {
  waitingForGoal = true;
  import("./goal.js").then((mod) => mod.openGoalEditor({ firstRun: true }));
}

// The editors open on top of this card, so hide it while they are in use.
function openRun() {
  waitingForRun = true;
  hideOnboarding();
  import("./demo-data.js").then((mod) => mod.openRunEditor());
}

function openCsv() {
  waitingForRun = true;
  hideOnboarding();
  import("./csv-import.js").then((mod) => mod.openCsvImporter());
}

$("onboardingAddRun")?.addEventListener("click", openRun);
$("onboardingCsv")?.addEventListener("click", openCsv);
$("onboardingSkip")?.addEventListener("click", finishOnboarding);

window.addEventListener("ritmo-goal-saved", () => {
  if (!active || !waitingForGoal) return;
  waitingForGoal = false;
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
