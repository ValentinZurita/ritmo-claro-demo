// File map: queued Drive saves and a quiet refresh when the tab is visible.

import { fetchStore, readSession, saveStore } from "./account.js";
import { goalStore, hydrateGoal } from "./goal-store.js";
import { runStore } from "./run-store.js";

let chain = Promise.resolve();
let lastHydrate = 0;

function enqueue(work) {
  chain = chain.then(work).catch((error) => {
    window.dispatchEvent(
      new CustomEvent("ritmo-persist-error", {
        detail: error instanceof Error ? error.message : "No se pudo guardar",
      }),
    );
  });
  return chain;
}

export function persistAll() {
  const session = readSession();
  if (!session) return;
  enqueue(async () => {
    await saveStore({
      runs: runStore.listRuns(),
      goal: goalStore.hasGoal() ? goalStore.getGoal() : null,
      onboardingComplete: goalStore.getOnboardingComplete(),
      extraMeta: goalStore.getExtraMeta(),
    });
    lastHydrate = Date.now();
  });
}

export async function hydrateFromCloud() {
  const session = readSession();
  if (!session) return { skipped: 0 };
  const loaded = await fetchStore();
  runStore.setRuns(loaded.runs || []);
  hydrateGoal({
    goal: loaded.goal,
    onboardingComplete: loaded.onboardingComplete,
    extra: loaded.extraMeta,
  });
  lastHydrate = Date.now();
  window.dispatchEvent(new Event("ritmo-runs-updated"));
  window.dispatchEvent(new Event("ritmo-goal-updated"));
  return loaded;
}

export function startVisibilityHydrate() {
  lastHydrate = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastHydrate < 30000) return;
    enqueue(async () => {
      await hydrateFromCloud();
    });
  });
}
