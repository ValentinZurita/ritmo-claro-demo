// File map: derives comparable-run facts without touching the page or user data.

import { getComparableRunGroup } from "./comparable-runs.js";

const paceFor = (run) => run.duration / run.distance;

function average(values) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}

export function summarizeRunningProgress(records) {
  const all = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const distanceGroup = getComparableRunGroup(all);
  const comparableRuns = distanceGroup.runs;
  const withHeartRate = comparableRuns.filter(
    (run) => Number.isFinite(Number(run.hr)) && Number(run.hr) > 0,
  );
  const lowFeeling = comparableRuns.filter(
    (run) => Number(run.feel) > 0 && Number(run.feel) <= 6,
  );
  const highFeeling = comparableRuns.filter(
    (run) => Number(run.feel) >= 7 && Number(run.feel) <= 10,
  );
  const first = comparableRuns[0] ?? null;
  const latest = comparableRuns.at(-1) ?? null;
  const paceChange = first && latest ? paceFor(first) - paceFor(latest) : null;

  return {
    comparableRuns,
    distanceGroup,
    latestNote: [...all].reverse().find((run) => run.note?.trim()) ?? null,
    pace: {
      count: comparableRuns.length,
      first,
      latest,
      firstMinPerKm: first ? paceFor(first) : null,
      latestMinPerKm: latest ? paceFor(latest) : null,
      changeMinPerKm: paceChange,
      trend:
        paceChange === null
          ? null
          : paceChange > 0.03
            ? "improved"
            : paceChange < -0.03
              ? "slower"
              : "similar",
    },
    heartRate: {
      count: withHeartRate.length,
      first: withHeartRate[0] ?? null,
      latest: withHeartRate.at(-1) ?? null,
    },
    feeling: {
      lowCount: lowFeeling.length,
      highCount: highFeeling.length,
      lowAverageMinPerKm: average(lowFeeling.map(paceFor)),
      highAverageMinPerKm: average(highFeeling.map(paceFor)),
    },
  };
}
