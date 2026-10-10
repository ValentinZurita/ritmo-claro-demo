// File map: selects the best-supported distance group for fair run comparisons.

export function getComparableRunGroup(records) {
  const runs = [...records]
    .filter(
      (run) =>
        Number.isFinite(Number(run.distance)) &&
        Number(run.distance) > 0 &&
        Number.isFinite(Number(run.duration)) &&
        Number(run.duration) > 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!runs.length)
    return { runs: [], centerKm: null, minKm: null, maxKm: null };

  const groups = runs.map((centerRun) => {
    const centerKm = Number(centerRun.distance);
    const tolerance = Math.max(0.05, centerKm * 0.05);
    const selectedRuns = runs.filter(
      (run) => Math.abs(Number(run.distance) - centerKm) <= tolerance,
    );
    const distances = selectedRuns.map((run) => Number(run.distance));
    const meanDistance =
      distances.reduce((total, distance) => total + distance, 0) /
      distances.length;
    const spread = distances.reduce(
      (total, distance) => total + Math.abs(distance - meanDistance),
      0,
    );
    return {
      runs: selectedRuns,
      centerKm,
      minKm: Math.min(...distances),
      maxKm: Math.max(...distances),
      spread,
      latestDate: selectedRuns.at(-1).date,
    };
  });

  return groups.sort(
    (a, b) =>
      b.runs.length - a.runs.length ||
      a.spread - b.spread ||
      b.latestDate.localeCompare(a.latestDate),
  )[0];
}

export function formatDistanceGroup(group) {
  if (!group?.runs?.length) return "sin registros comparables";
  const format = (value) =>
    new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(value);
  return group.minKm === group.maxKm
    ? `${format(group.centerKm)} km`
    : `${format(group.minKm)}–${format(group.maxKm)} km`;
}
