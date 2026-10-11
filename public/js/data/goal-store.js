// File map: stores and validates the runner's editable goal.

const STORAGE_KEY = "ritmo-claro-goal-v1";
export const DEFAULT_GOAL = {
  distanceKm: 10,
  durationMinutes: 80,
  date: "2026-11-30",
};

let mode = "guest";
let persistGoal = null;
let memoryGoal = null;
let onboardingComplete = false;
let extraMeta = {};

function normalizeGoal(value) {
  const distanceKm = Number(value?.distanceKm);
  const durationMinutes = Number(value?.durationMinutes);
  const date = String(value?.date ?? "");
  if (
    !Number.isFinite(distanceKm) ||
    distanceKm <= 0 ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  )
    return null;
  return { distanceKm, durationMinutes, date };
}

export function initGoalStore(options = {}) {
  mode = options.mode === "cloud" ? "cloud" : "guest";
  persistGoal = options.persist || null;
  if (mode === "cloud") {
    memoryGoal = null;
    onboardingComplete = false;
    extraMeta = {};
  }
}

export function hydrateGoal({
  goal = null,
  onboardingComplete: complete = false,
  extra = {},
} = {}) {
  memoryGoal = normalizeGoal(goal);
  onboardingComplete = Boolean(complete);
  extraMeta = { ...extra };
}

function persist() {
  persistGoal?.();
}

export const goalStore = {
  hasGoal() {
    if (mode === "cloud") return Boolean(memoryGoal);
    return true;
  },
  getGoal() {
    if (mode === "cloud") return { ...(memoryGoal || DEFAULT_GOAL) };
    try {
      return (
        normalizeGoal(
          JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null"),
        ) || { ...DEFAULT_GOAL }
      );
    } catch {
      return { ...DEFAULT_GOAL };
    }
  },
  saveGoal(goal) {
    const normalized = normalizeGoal(goal);
    if (!normalized) return goalStore.getGoal();
    if (mode === "cloud") {
      memoryGoal = normalized;
      persist();
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    window.dispatchEvent(new Event("ritmo-goal-updated"));
    return normalized;
  },
  getOnboardingComplete() {
    return mode === "cloud" ? onboardingComplete : true;
  },
  setOnboardingComplete(value) {
    onboardingComplete = Boolean(value);
    persist();
  },
  getExtraMeta() {
    return { ...extraMeta };
  },
};

export function getGoalDistanceBand(
  distanceKm = goalStore.getGoal().distanceKm,
) {
  const tolerance = Math.max(0.25, Number(distanceKm) * 0.05);
  return {
    min: Math.max(0, Number(distanceKm) - tolerance),
    max: Number(distanceKm) + tolerance,
  };
}

export function runsNearGoalDistance(records, distanceKm) {
  const band = getGoalDistanceBand(distanceKm);
  return [...records]
    .filter((run) => run.distance >= band.min && run.distance <= band.max)
    .sort((a, b) => a.date.localeCompare(b.date));
}
