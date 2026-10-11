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
import { initLanguage, t } from "./i18n.js";

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

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function bootCloud() {
  showBootError("Abriendo tu cuenta…");
  initCloudStores();
  const loaded = await withTimeout(
    fetchStore(),
    20000,
    "Google Drive no respondió",
  );
  runStore.setRuns(loaded.runs || []);
  hydrateGoal({
    goal: loaded.goal,
    onboardingComplete: loaded.onboardingComplete,
    extra: loaded.extraMeta,
  });
  startVisibilityHydrate();
  await loadFeatures();
  showLayout();
  showBootError("");
  if (!loaded.goal || !loaded.onboardingComplete) {
    window.dispatchEvent(new Event("ritmo-start-onboarding"));
  }
}

// Saved AI readings are personal text; remove them whenever the account session ends.
function clearStoredReadings() {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("ritmo-claro-reading:")) localStorage.removeItem(key);
  } catch {}
}

function signOutToGuest() {
  signOutGoogle();
  clearStoredReadings();
  location.reload();
}

async function start() {
  initLanguage();
  document.body.classList.add("is-booting");
  window.addEventListener("ritmo-account-ready", () => location.reload());
  window.addEventListener("ritmo-account-signout", signOutToGuest);
  window.addEventListener("ritmo-onboarding-done", showLayout);

  if (!readSession()) {
    try {
      if (await consumeGoogleRedirect()) {
        location.replace(`${location.origin}/`);
        return;
      }
    } catch {
      const toast = $("toast");
      if (toast) {
        toast.textContent = t("No se pudo terminar de entrar con Google.");
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 2800);
      }
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
    clearStoredReadings();
    startGuest();
    await loadFeatures();
    showLayout();
    const toast = $("toast");
    if (toast) {
      toast.textContent = t(
        "Entra otra vez. Mientras tanto ves el demo local.",
      );
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2800);
    }
  }
}

start().catch((error) => {
  showBootError(
    error instanceof Error ? error.message : t("No se pudo abrir Ritmo Claro"),
  );
  if (!readSession()) showLayout();
});
