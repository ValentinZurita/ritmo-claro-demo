// File map: restores, lists, sorts, and saves running records.

import { isValidRun, persistableRun, runKey } from "./run-key.js";
import { sampleVersion, seed, seedExtras } from "./sample-runs.js";

const STORAGE_KEY = "ritmo-claro-runs";
const VERSION_KEY = "ritmo-claro-sample-version";

export function createRunStore({
  seed,
  seedExtras,
  sampleVersion,
  storage,
  skipSeed = false,
  persist,
}) {
  const expandedSeed = [...seedExtras, ...seed];
  const fictionalKeys = new Set(expandedSeed.map(runKey));
  const originalSeedKeys = new Set(seed.map(runKey));
  let runs;

  function save() {
    if (persist) {
      persist(runs.map((run) => persistableRun(run)));
      return;
    }
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(runs.map(persistableRun)));
    } catch {}
  }

  if (skipSeed) {
    runs = [];
  } else {
    try {
      const saved = JSON.parse(storage.getItem(STORAGE_KEY));
      const version = storage.getItem(VERSION_KEY);
      const normalized = Array.isArray(saved)
        ? saved.map(persistableRun).filter(isValidRun)
        : null;
      const isOriginalMock =
        normalized &&
        normalized.length === seed.length &&
        normalized.every((run) => originalSeedKeys.has(runKey(run)));
      const onlyFiction =
        normalized &&
        normalized.length > 0 &&
        normalized.every((run) => fictionalKeys.has(runKey(run)));
      runs =
        !normalized ||
        isOriginalMock ||
        (onlyFiction && version !== sampleVersion)
          ? expandedSeed.map(persistableRun)
          : normalized;
      if (version !== sampleVersion)
        storage.setItem(VERSION_KEY, sampleVersion);
    } catch {
      runs = expandedSeed.map(persistableRun);
    }
    save();
  }

  return {
    listRuns: () => runs.map((run) => ({ ...run })),
    listRunsSorted: () =>
      runs
        .map((run) => ({ ...run }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    setRuns(records) {
      runs = records.map(persistableRun).filter(isValidRun);
    },
    addRuns(records) {
      runs.push(...records.map(persistableRun).filter(isValidRun));
      save();
    },
  };
}

export let runStore;

export function initRunStore(options) {
  runStore = createRunStore(options);
  return runStore;
}

export function initGuestRunStore() {
  return initRunStore({
    seed,
    seedExtras,
    sampleVersion,
    skipSeed: false,
    storage: {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    },
  });
}
