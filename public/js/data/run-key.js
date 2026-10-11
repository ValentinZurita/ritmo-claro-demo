// File map: stable run identity after Sheet number rounding.

export function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

export function normalizeRun(run) {
  const extras =
    run?.extras && typeof run.extras === "object" ? { ...run.extras } : {};
  return {
    date: String(run?.date ?? "")
      .trim()
      .slice(0, 10),
    distance: roundTo(run?.distance, 3),
    duration: roundTo(run?.duration, 2),
    hr: optionalNumber(run?.hr),
    feel: optionalNumber(run?.feel),
    cadence: optionalNumber(run?.cadence),
    rpe: optionalNumber(run?.rpe),
    elevationGain: optionalNumber(run?.elevationGain),
    caloriesKcal: optionalNumber(run?.caloriesKcal),
    note: String(run?.note ?? "").trim(),
    extras,
  };
}

export function isValidRun(run) {
  const n = normalizeRun(run);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(n.date) &&
    Number.isFinite(n.distance) &&
    n.distance > 0 &&
    Number.isFinite(n.duration) &&
    n.duration > 0
  );
}

export function persistableRun(run) {
  const { extras, ...rest } = normalizeRun(run);
  return Object.keys(extras).length ? { ...rest, extras } : rest;
}

export function runKey(run) {
  const n = normalizeRun(run);
  return `${n.date}|${n.distance.toFixed(3)}|${n.duration.toFixed(2)}`;
}
