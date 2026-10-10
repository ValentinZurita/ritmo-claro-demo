// File map: time windows and downsampling for chart views as history grows.

export const CHART_RANGES = [
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
  { id: "year", label: "Año" },
  { id: "all", label: "Todo" },
];

export const MAX_CHART_POINTS = 200;

export function localISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function rangeStartDate(rangeId, now = new Date()) {
  if (rangeId === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekday = start.getDay();
    start.setDate(start.getDate() - (weekday === 0 ? 6 : weekday - 1));
    return start;
  }
  if (rangeId === "month")
    return new Date(now.getFullYear(), now.getMonth(), 1);
  if (rangeId === "year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

export function runsInRange(runs, rangeId, now = new Date()) {
  const start = rangeStartDate(rangeId, now);
  if (!start) return [...runs];
  const startKey = localISODate(start);
  const endKey = localISODate(now);
  return runs.filter((run) => {
    const date = String(run.date || "");
    return date >= startKey && date <= endKey;
  });
}

export function downsampleRuns(runs, max = MAX_CHART_POINTS) {
  if (runs.length <= max) return runs;
  const step = (runs.length - 1) / (max - 1);
  const picked = [];
  for (let i = 0; i < max; i += 1) picked.push(runs[Math.round(i * step)]);
  return picked;
}
