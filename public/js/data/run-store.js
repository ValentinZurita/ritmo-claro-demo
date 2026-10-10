// File map: restores, lists, sorts, and saves running records.

import { sampleVersion, seed, seedExtras } from "./sample-runs.js";

const STORAGE_KEY = "ritmo-claro-runs";
const VERSION_KEY = "ritmo-claro-sample-version";

function runKey(run) {
  return `${run.date}|${run.distance}|${run.duration}`;
}

export function createRunStore({ seed, seedExtras, sampleVersion, storage }) {
  const expandedSeed = [...seedExtras, ...seed];
  const fictionalKeys = new Set(expandedSeed.map(runKey));
  const originalSeedKeys = new Set(seed.map(runKey));
  let runs;

  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    const version = storage.getItem(VERSION_KEY);
    const isOriginalMock =
      Array.isArray(saved) &&
      saved.length === seed.length &&
      saved.every((run) => originalSeedKeys.has(runKey(run)));
    const onlyFiction =
      Array.isArray(saved) &&
      saved.length > 0 &&
      saved.every((run) => fictionalKeys.has(runKey(run)));
    runs =
      !Array.isArray(saved) ||
      isOriginalMock ||
      (onlyFiction && version !== sampleVersion)
        ? expandedSeed
        : saved;
    if (version !== sampleVersion) storage.setItem(VERSION_KEY, sampleVersion);
  } catch {
    runs = expandedSeed;
  }

  function save() {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(runs));
    } catch {}
  }

  save();

  return {
    listRuns: () => runs.map((run) => ({ ...run })),
    listRunsSorted: () =>
      runs
        .map((run) => ({ ...run }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    addRuns(records) {
      runs.push(...records.map((run) => ({ ...run })));
      save();
    },
  };
}

export const runStore = createRunStore({
  seed,
  seedExtras,
  sampleVersion,
  storage: {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  },
});
