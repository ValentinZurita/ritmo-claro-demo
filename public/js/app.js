// File map: boot guest or Google Drive account, then load feature modules.

import {
  clearSession,
  consumeGoogleRedirect,
  fetchStore,
  readSession,
  setActiveMode,
  signOutGoogle,
} from "./data/account.js";
import { hydrateGoal, initGoalStore } from "./data/goal-store.js";
import { persistAll, startVisibilityHydrate } from "./data/cloud-sync.js";
import { initGuestRunStore, initRunStore, runStore } from "./data/run-store.js";

const $ = (id) => document.getElementById(id);

function showLayout() {
  document.body.classList.remove("is-booting");
}

function showBootError(message) {
  const box = $("bootError");
  if (!box) return;
  box.hidden = !message;
  box.textContent = message || "";
}

async function loadFeatures() {
  await import("./goal.js");
  await import("./demo-data.js");
  await import("./dashboard.js");
  await import("./analytics-tools.js");
  await import("./csv-import.js");
  await import("./ai-analysis.js");
  await import("./account-ui.js");
  await import("./onboarding.js");
}

function startGuest() {
  setActiveMode("guest");
  initGoalStore({ mode: "guest" });
  initGuestRunStore();
}

function initCloudStores() {
  setActiveMode("cloud");
  initGoalStore({ mode: "cloud", persist: persistAll });
  initRunStore({
    seed: [],
    seedExtras: [],
    sampleVersion: "0",
    skipSeed: true,
    persist: persistAll,
    storage: {
      getItem: () => null,
      setItem: () => {},
    },
  });
}

async function bootCloud() {
  initCloudStores();
  const loaded = await fetchStore();
  runStore.setRuns(loaded.runs || []);
  hydrateGoal({
    goal: loaded.goal,
    onboardingComplete: loaded.onboardingComplete,
    extra: loaded.extraMeta,
  });
  startVisibilityHydrate();
  showBootError("");
  await loadFeatures();
  if (!loaded.goal || !loaded.onboardingComplete) {
    window.dispatchEvent(new Event("ritmo-start-onboarding"));
    return;
  }
  showLayout();
}

function signOutToGuest() {
  signOutGoogle();
  location.reload();
}

async function start() {
  document.body.classList.add("is-booting");
  window.addEventListener("ritmo-account-ready", () => location.reload());
  window.addEventListener("ritmo-account-signout", signOutToGuest);
  window.addEventListener("ritmo-onboarding-done", showLayout);

  try {
    if (await consumeGoogleRedirect()) {
      location.replace(`${location.origin}/`);
      return;
    }
  } catch {
    const toast = $("toast");
    if (toast) {
      toast.textContent = "No se pudo terminar de entrar con Google.";
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2800);
    }
  }

  const session = readSession();
  if (!session) {
    startGuest();
    await loadFeatures();
    showLayout();
    return;
  }

  try {
    await bootCloud();
  } catch {
    clearSession();
    startGuest();
    await loadFeatures();
    showLayout();
    const toast = $("toast");
    if (toast) {
      toast.textContent = "Entra otra vez. Mientras tanto ves el demo local.";
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2800);
    }
  }
}

start().catch((error) => {
  showBootError(
    error instanceof Error ? error.message : "No se pudo abrir Ritmo Claro",
  );
  if (!readSession()) showLayout();
});
