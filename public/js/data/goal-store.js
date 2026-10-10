// File map: stores and validates the runner's editable goal.

const STORAGE_KEY = "ritmo-claro-goal-v1";
const DEFAULT_GOAL = {
  distanceKm: 10,
  durationMinutes: 80,
  date: "2026-11-30",
};

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
    return { ...DEFAULT_GOAL };
  return { distanceKm, durationMinutes, date };
}

export const goalStore = {
  getGoal() {
    try {
      return normalizeGoal(
        JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null"),
      );
    } catch {
      return { ...DEFAULT_GOAL };
    }
  },
  saveGoal(goal) {
    const normalized = normalizeGoal(goal);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new Event("ritmo-goal-updated"));
    return normalized;
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
