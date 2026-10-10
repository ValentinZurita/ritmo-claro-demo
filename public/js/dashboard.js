// File map: dashboard rendering, charts, and primary interactions.

import { runStore } from "./data/run-store.js";
import { goalStore } from "./data/goal-store.js";
import {
  formatDistanceGroup,
  getComparableRunGroup,
} from "./analytics/comparable-runs.js";
import { formatDate as fmtDate, formatPace as fmtPace } from "./data/format.js";
import {
  CHART_RANGES,
  downsampleRuns,
  runsInRange,
} from "./data/chart-range.js";

export const chartSpecs = [
  {
    id: "resumen",
    title: "Señales de tus datos",
    shortTitle: "Señales",
    subtitle: "Promedio de tus últimas 15 carreras",
  },
  {
    id: "pace",
    title: "Ritmo en tus carreras",
    shortTitle: "Ritmo",
    subtitle: "Carreras de distancia parecida · un número menor es más rápido",
  },
  {
    id: "distances",
    title: "Distancia de cada salida",
    shortTitle: "Distancias",
    subtitle: "Todo el historial · la línea es la distancia de tu meta",
  },
  {
    id: "days",
    title: "Días que corriste",
    shortTitle: "Días",
    subtitle: "Días con carrera en cada semana",
  },
  {
    id: "heart",
    title: "Ritmo y pulso",
    shortTitle: "Pulso",
    subtitle: "El mismo grupo de distancia · cada punto es una carrera",
  },
  {
    id: "effort",
    title: "Esfuerzo y ritmo",
    shortTitle: "Esfuerzo",
    subtitle: "Qué tan dura fue la carrera, frente al ritmo",
  },
];
export const graphCharts = chartSpecs.filter((spec) => spec.id !== "resumen");
let activeChart = "resumen";
const RANGE_KEY = "ritmo-claro-chart-range";
function readChartRange() {
  try {
    const saved = localStorage.getItem(RANGE_KEY);
    if (CHART_RANGES.some((range) => range.id === saved)) return saved;
  } catch {}
  return "all";
}
let chartRange = readChartRange();
const chartSafe = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const chartRuns = () => runStore.listRunsSorted();
export const getActiveChart = () => activeChart;
export const setActiveChart = (id) => {
  const chartId = id === "speed" ? "pace" : id;
  if (chartSpecs.some((spec) => spec.id === chartId)) activeChart = chartId;
};
function eligibleRuns(all) {
  return getComparableRunGroup(all).runs;
}
function eligibleRangeLabel(all = chartRuns()) {
  const group = getComparableRunGroup(all);
  return `${formatDistanceGroup(group)} · ${group.runs.length} carreras similares`;
}
function viewRuns(all) {
  return runsInRange(all, chartRange);
}
function rangeLabel(id = chartRange) {
  return CHART_RANGES.find((range) => range.id === id)?.label ?? "Todo";
}
function closeRangeMenu() {
  const host = document.getElementById("chartRange");
  if (!host) return;
  host.classList.remove("is-open");
  const toggle = host.querySelector(".chart-range-toggle");
  const menu = host.querySelector(".chart-range-menu");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
  if (menu) menu.hidden = true;
}
function setChartRange(id) {
  if (!CHART_RANGES.some((range) => range.id === id)) return;
  chartRange = id;
  try {
    localStorage.setItem(RANGE_KEY, id);
  } catch {}
  closeRangeMenu();
  renderCurrentCarousel(chartRuns());
}
let rangeMenuBound = false;
function ensureRange() {
  const host = document.getElementById("chartRange");
  if (!host) return;
  if (!host.dataset.ready) {
    host.dataset.ready = "1";
    host.innerHTML = `<button class="chart-range-toggle" type="button" aria-expanded="false" aria-haspopup="listbox" aria-controls="chartRangeMenu" aria-label="Periodo de las gráficas"><span class="chart-range-current"></span></button><div class="chart-range-menu" id="chartRangeMenu" role="listbox" hidden>${CHART_RANGES.map(
      (range) =>
        `<button class="chart-range-option" type="button" role="option" data-range="${range.id}">${range.label}</button>`,
    ).join("")}</div>`;
    const toggle = host.querySelector(".chart-range-toggle");
    const menu = host.querySelector(".chart-range-menu");
    toggle.onclick = (event) => {
      event?.stopPropagation();
      if (host.classList.contains("is-open")) {
        closeRangeMenu();
        return;
      }
      host.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      menu.hidden = false;
    };
    host.querySelectorAll(".chart-range-option").forEach((button) => {
      button.onclick = (event) => {
        event?.stopPropagation();
        setChartRange(button.dataset.range);
      };
    });
  }
  const toggle = host.querySelector(".chart-range-toggle");
  host.querySelector(".chart-range-current").textContent = rangeLabel();
  toggle.setAttribute("aria-label", `Periodo: ${rangeLabel()}`);
  host.querySelectorAll(".chart-range-option").forEach((button) => {
    button.setAttribute(
      "aria-selected",
      String(button.dataset.range === chartRange),
    );
  });
  if (!rangeMenuBound) {
    rangeMenuBound = true;
    document.addEventListener("mousedown", (event) => {
      const box = document.getElementById("chartRange");
      if (!box?.classList.contains("is-open")) return;
      if (box.contains(event.target)) return;
      closeRangeMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeRangeMenu();
    });
  }
}
function recentRunWindow(all, limit = 15) {
  return all.slice(-limit);
}
function meanOf(runs, key) {
  const values = runs
    .map((run) => Number(run[key]))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}
function renderSignalDash(all) {
  const host = document.getElementById("chartDash");
  if (!host) return;
  const recent = recentRunWindow(all),
    timed = recent.filter(
      (run) => Number(run.distance) > 0 && Number(run.duration) > 0,
    ),
    totalDistance = timed.reduce((sum, run) => sum + Number(run.distance), 0),
    totalDuration = timed.reduce((sum, run) => sum + Number(run.duration), 0),
    pace = totalDistance > 0 ? totalDuration / totalDistance : null,
    pulse = meanOf(recent, "hr"),
    effort = meanOf(recent, "rpe"),
    distance = meanOf(recent, "distance");
  const tiles = [
    {
      label: "Ritmo",
      value: pace != null ? fmtPace(pace) : "—",
      unit: "min / km",
    },
    {
      label: "Pulso",
      value: pulse != null ? String(Math.round(pulse)) : "—",
      unit: "latidos / min",
    },
    {
      label: "Esfuerzo",
      value:
        effort != null
          ? Number.isInteger(effort)
            ? String(effort)
            : effort.toFixed(1)
          : "—",
      unit: "de 10",
    },
    {
      label: "Distancia",
      value: distance != null ? distance.toFixed(1) : "—",
      unit: "km",
    },
  ];
  host.innerHTML = tiles
    .map(
      (tile) =>
        `<div class="chart-dash-item"><span class="chart-dash-label">${chartSafe(tile.label)}</span><span class="chart-dash-value">${chartSafe(tile.value)}</span><span class="chart-dash-note">${chartSafe(tile.unit)}</span></div>`,
    )
    .join("");
}
function ensureDots() {
  const host = document.getElementById("chartDots");
  host.innerHTML = chartSpecs
    .map(
      (s, i) =>
        `<button class="carousel-tab" type="button" data-chart="${s.id}" aria-label="Ver gráfica: ${s.title}" title="${s.title}" aria-pressed="${s.id === activeChart}">${s.shortTitle}</button>`,
    )
    .join("");
  host.querySelectorAll("button").forEach((b, i) => {
    b.onclick = () => showChart(b.dataset.chart);
    b.onkeydown = (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const step = e.key === "ArrowRight" ? 1 : -1;
        showChart(
          chartSpecs[(i + step + chartSpecs.length) % chartSpecs.length].id,
        );
        host.querySelector(`[data-chart="${activeChart}"]`)?.focus();
      }
    };
  });
}
function drawLineMetric(all, key, target, color, higherIsFaster = false) {
  const canvas = document.getElementById("paceChart"),
    ctx = canvas.getContext("2d"),
    box = canvas.getBoundingClientRect(),
    dpr = devicePixelRatio || 1;
  canvas.width = Math.max(1, box.width * dpr);
  canvas.height = Math.max(1, box.height * dpr);
  ctx.scale(dpr, dpr);
  const w = box.width,
    h = box.height,
    p = { l: 42, r: 12, t: 14, b: 29 };
  ctx.clearRect(0, 0, w, h);
  const data = downsampleRuns(all)
    .map((r) => ({ date: r.date, value: Number(r[key]) }))
    .filter((d) => Number.isFinite(d.value) && d.value > 0);
  if (data.length < 1) {
    ctx.fillStyle = "#71807b";
    ctx.font = "12px system-ui";
    ctx.fillText("Aún no hay datos suficientes para esta gráfica.", 16, 50);
    return;
  }
  let min =
      Math.floor(
        Math.min(...data.map((d) => d.value), target ?? Infinity) * 2,
      ) / 2,
    max =
      Math.ceil(
        Math.max(...data.map((d) => d.value), target ?? -Infinity) * 2,
      ) / 2;
  if (!Number.isFinite(min))
    min = Math.floor(Math.min(...data.map((d) => d.value)) * 2) / 2;
  if (!Number.isFinite(max))
    max = Math.ceil(Math.max(...data.map((d) => d.value)) * 2) / 2;
  if (max === min) max = min + 1;
  const y = (v) =>
      p.t +
      ((higherIsFaster ? max - v : v - min) / (max - min)) * (h - p.t - p.b),
    x = (i) => p.l + (i * (w - p.l - p.r)) / Math.max(1, data.length - 1);
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  ctx.fillStyle = "#89958e";
  for (let i = 0; i < 4; i++) {
    const v = min + ((max - min) * i) / 3,
      yy = y(v);
    ctx.strokeStyle = "#e9eae2";
    ctx.beginPath();
    ctx.moveTo(p.l, yy);
    ctx.lineTo(w - p.r, yy);
    ctx.stroke();
    ctx.fillText(
      key === "pace"
        ? fmtPace(v)
        : key === "speed"
          ? v.toFixed(1)
          : Math.round(v),
      p.l - 7,
      yy + 3,
    );
  }
  if (target !== null && target >= min && target <= max) {
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = "#e39a61";
    ctx.beginPath();
    ctx.moveTo(p.l, y(target));
    ctx.lineTo(w - p.r, y(target));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (data.length > 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    data.forEach((d, i) =>
      i ? ctx.lineTo(x(i), y(d.value)) : ctx.moveTo(x(i), y(d.value)),
    );
    ctx.stroke();
  }
  data.forEach((d, i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x(i), y(d.value), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#89958e";
    ctx.textAlign = "center";
    ctx.fillText(fmtDate(d.date), x(i), h - 8);
  });
}
function drawScatter(all, type) {
  const canvas = document.getElementById("paceChart"),
    ctx = canvas.getContext("2d"),
    box = canvas.getBoundingClientRect(),
    dpr = devicePixelRatio || 1;
  canvas.width = Math.max(1, box.width * dpr);
  canvas.height = Math.max(1, box.height * dpr);
  ctx.scale(dpr, dpr);
  const w = box.width,
    h = box.height,
    p = { l: 42, r: 13, t: 14, b: 31 };
  ctx.clearRect(0, 0, w, h);
  let data = eligibleRuns(all)
    .filter((r) => {
      const key =
        type === "heart"
          ? "hr"
          : type === "feel"
            ? "feel"
            : type === "cadencepace"
              ? "cadence"
              : type === "elevation"
                ? "elevationGain"
                : "rpe";
      const value = r[key];
      return (
        value !== null &&
        value !== undefined &&
        value !== "" &&
        Number.isFinite(Number(value)) &&
        (type === "elevation" ? Number(value) >= 0 : Number(value) > 0)
      );
    })
    .map((r) => ({
      x: Number(
        r[
          type === "heart"
            ? "hr"
            : type === "feel"
              ? "feel"
              : type === "cadencepace"
                ? "cadence"
                : type === "elevation"
                  ? "elevationGain"
                  : "rpe"
        ],
      ),
      y: Number(r.duration) / Number(r.distance),
    }));
  if (data.length < 2) {
    ctx.fillStyle = "#71807b";
    ctx.font = "12px system-ui";
    ctx.fillText(
      type === "heart"
        ? "Añade pulso a dos carreras parecidas."
        : type === "feel"
          ? "Añade sensación a dos carreras parecidas."
          : type === "cadencepace"
            ? "Añade cadencia a dos carreras parecidas."
            : type === "elevation"
              ? "Añade desnivel a dos carreras parecidas."
              : "Añade esfuerzo percibido a dos carreras parecidas.",
      16,
      50,
    );
    return;
  }
  data = downsampleRuns(data);
  let xmin =
      type === "feel" || type === "effort"
        ? 1
        : type === "elevation"
          ? Math.floor(Math.min(...data.map((d) => d.x)) / 25) * 25
          : Math.floor(Math.min(...data.map((d) => d.x)) / 10) * 10,
    xmax =
      type === "feel" || type === "effort"
        ? 10
        : type === "elevation"
          ? Math.ceil(Math.max(...data.map((d) => d.x)) / 25) * 25
          : Math.ceil(Math.max(...data.map((d) => d.x)) / 10) * 10;
  if (xmin === xmax) xmax = xmin + 1;
  let ymin = Math.floor(Math.min(...data.map((d) => d.y), 8) * 2) / 2,
    ymax = Math.ceil(Math.max(...data.map((d) => d.y), 8) * 2) / 2;
  if (ymin === ymax) ymax = ymin + 1;
  const x = (v) => p.l + ((v - xmin) / (xmax - xmin)) * (w - p.l - p.r),
    y = (v) => p.t + ((v - ymin) / (ymax - ymin)) * (h - p.t - p.b);
  ctx.font = "10px system-ui";
  ctx.fillStyle = "#89958e";
  ctx.textAlign = "right";
  for (let i = 0; i < 4; i++) {
    const v = ymin + ((ymax - ymin) * i) / 3,
      yy = y(v);
    ctx.strokeStyle = "#e9eae2";
    ctx.beginPath();
    ctx.moveTo(p.l, yy);
    ctx.lineTo(w - p.r, yy);
    ctx.stroke();
    ctx.fillText(fmtPace(v), p.l - 7, yy + 3);
  }
  ctx.textAlign = "center";
  const ticks =
    type === "feel" || type === "effort"
      ? [1, 4, 7, 10]
      : [xmin, Math.round((xmin + xmax) / 2), xmax];
  ticks.forEach((t) => ctx.fillText(String(t), x(t), h - 8));
  data.forEach((d) => {
    ctx.fillStyle =
      type === "heart" || type === "cadencepace" ? "#709b9d" : "#176b52";
    ctx.beginPath();
    ctx.arc(x(d.x), y(d.y), 5, 0, Math.PI * 2);
    ctx.fill();
  });
}
function drawWeekly(all) {
  const canvas = document.getElementById("paceChart"),
    ctx = canvas.getContext("2d"),
    box = canvas.getBoundingClientRect(),
    dpr = devicePixelRatio || 1;
  canvas.width = Math.max(1, box.width * dpr);
  canvas.height = Math.max(1, box.height * dpr);
  ctx.scale(dpr, dpr);
  const w = box.width,
    h = box.height,
    p = { l: 38, r: 10, t: 16, b: 34 },
    weeks = new Map();
  for (const run of all) {
    const day = new Date(`${run.date}T12:00:00`);
    if (Number.isNaN(+day) || Number(run.distance) <= 0) continue;
    const mondayOffset = (day.getDay() + 6) % 7;
    day.setDate(day.getDate() - mondayOffset);
    const key = day.toISOString().slice(0, 10),
      item = weeks.get(key) || { start: day, km: 0, count: 0 };
    item.km += Number(run.distance);
    item.count++;
    weeks.set(key, item);
  }
  const data = downsampleRuns([...weeks.values()]),
    max = Math.max(1, ...data.map((item) => item.km)),
    chartH = h - p.t - p.b,
    slot = (w - p.l - p.r) / Math.max(data.length, 1),
    barW = Math.min(30, slot * 0.58);
  ctx.clearRect(0, 0, w, h);
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  ctx.fillStyle = "#89958e";
  for (let i = 0; i < 4; i++) {
    const value = (max * i) / 3,
      y = p.t + chartH - (value / max) * chartH;
    ctx.strokeStyle = "#e9eae2";
    ctx.beginPath();
    ctx.moveTo(p.l, y);
    ctx.lineTo(w - p.r, y);
    ctx.stroke();
    ctx.fillText(value.toFixed(0), p.l - 7, y + 3);
  }
  data.forEach((item, i) => {
    const x = p.l + i * slot + (slot - barW) / 2,
      barH = (item.km / max) * chartH,
      y = p.t + chartH - barH;
    ctx.fillStyle = "#176b52";
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, 5);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#52625b";
    ctx.fillText(`${item.count} sal.`, x + barW / 2, Math.max(11, y - 5));
    ctx.fillStyle = "#89958e";
    ctx.fillText(
      fmtDate(item.start.toISOString().slice(0, 10)),
      x + barW / 2,
      h - 9,
    );
  });
  if (!data.length) {
    ctx.fillStyle = "#71807b";
    ctx.textAlign = "left";
    ctx.fillText("Añade carreras fechadas para ver semanas.", 14, 50);
  }
}
function drawDistanceBars(all) {
  const canvas = document.getElementById("paceChart"),
    ctx = canvas.getContext("2d"),
    box = canvas.getBoundingClientRect(),
    dpr = devicePixelRatio || 1;
  canvas.width = Math.max(1, box.width * dpr);
  canvas.height = Math.max(1, box.height * dpr);
  ctx.scale(dpr, dpr);
  const w = box.width,
    h = box.height,
    p = { l: 38, r: 10, t: 16, b: 34 },
    goalKm = goalStore.getGoal().distanceKm,
    runs = downsampleRuns(
      all.filter((run) => Number(run.distance) > 0 && run.date),
    ),
    max = Math.max(goalKm, ...runs.map((run) => Number(run.distance)), 1),
    chartH = h - p.t - p.b,
    slot = (w - p.l - p.r) / Math.max(runs.length, 1),
    barW = Math.min(28, slot * 0.62);
  ctx.clearRect(0, 0, w, h);
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  ctx.fillStyle = "#89958e";
  for (let i = 0; i < 4; i++) {
    const value = (max * i) / 3,
      y = p.t + chartH - (value / max) * chartH;
    ctx.strokeStyle = "#e9eae2";
    ctx.beginPath();
    ctx.moveTo(p.l, y);
    ctx.lineTo(w - p.r, y);
    ctx.stroke();
    ctx.fillText(value.toFixed(0), p.l - 7, y + 3);
  }
  const goalY = p.t + chartH - (goalKm / max) * chartH;
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = "#e39a61";
  ctx.beginPath();
  ctx.moveTo(p.l, goalY);
  ctx.lineTo(w - p.r, goalY);
  ctx.stroke();
  ctx.setLineDash([]);
  runs.forEach((run, i) => {
    const x = p.l + i * slot + (slot - barW) / 2,
      barH = (Number(run.distance) / max) * chartH,
      y = p.t + chartH - barH;
    ctx.fillStyle = "#176b52";
    ctx.beginPath();
    ctx.roundRect(x, y, barW, Math.max(barH, 1), 4);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#89958e";
    ctx.fillText(fmtDate(run.date), x + barW / 2, h - 9);
  });
  if (!runs.length) {
    ctx.fillStyle = "#71807b";
    ctx.textAlign = "left";
    ctx.fillText("Añade carreras para ver sus distancias.", 14, 50);
  }
}
function drawRunDays(all) {
  const canvas = document.getElementById("paceChart"),
    ctx = canvas.getContext("2d"),
    box = canvas.getBoundingClientRect(),
    dpr = devicePixelRatio || 1;
  canvas.width = Math.max(1, box.width * dpr);
  canvas.height = Math.max(1, box.height * dpr);
  ctx.scale(dpr, dpr);
  const w = box.width,
    h = box.height,
    p = { l: 32, r: 10, t: 16, b: 34 },
    weeks = new Map();
  for (const run of all) {
    const day = new Date(`${run.date}T12:00:00`);
    if (Number.isNaN(+day) || !run.date) continue;
    const mondayOffset = (day.getDay() + 6) % 7;
    day.setDate(day.getDate() - mondayOffset);
    const key = day.toISOString().slice(0, 10),
      item = weeks.get(key) || { start: day, dates: new Set() };
    item.dates.add(run.date);
    weeks.set(key, item);
  }
  const data = downsampleRuns([...weeks.values()]),
    max = Math.max(1, ...data.map((item) => item.dates.size)),
    chartH = h - p.t - p.b,
    slot = (w - p.l - p.r) / Math.max(data.length, 1),
    barW = Math.min(30, slot * 0.58);
  ctx.clearRect(0, 0, w, h);
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  ctx.fillStyle = "#89958e";
  for (let i = 0; i <= max; i++) {
    const y = p.t + chartH - (i / max) * chartH;
    ctx.strokeStyle = "#e9eae2";
    ctx.beginPath();
    ctx.moveTo(p.l, y);
    ctx.lineTo(w - p.r, y);
    ctx.stroke();
    ctx.fillText(String(i), p.l - 7, y + 3);
  }
  data.forEach((item, i) => {
    const count = item.dates.size,
      x = p.l + i * slot + (slot - barW) / 2,
      barH = (count / max) * chartH,
      y = p.t + chartH - barH;
    ctx.fillStyle = "#176b52";
    ctx.beginPath();
    ctx.roundRect(x, y, barW, Math.max(barH, 1), 5);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#52625b";
    ctx.fillText(
      `${count} ${count === 1 ? "día" : "días"}`,
      x + barW / 2,
      Math.max(11, y - 5),
    );
    ctx.fillStyle = "#89958e";
    ctx.fillText(
      fmtDate(item.start.toISOString().slice(0, 10)),
      x + barW / 2,
      h - 9,
    );
  });
  if (!data.length) {
    ctx.fillStyle = "#71807b";
    ctx.textAlign = "left";
    ctx.fillText("Añade carreras fechadas para ver los días.", 14, 50);
  }
}
function describeChart(all, type) {
  if (type === "resumen") {
    const count = recentRunWindow(all).length;
    if (!count)
      return {
        title: "Aún no hay carreras",
        text: "",
        evidence: "",
      };
    return {
      title:
        count === 1
          ? "Tu última carrera"
          : `Promedio de tus últimas ${count} carreras`,
      text: "",
      evidence: "",
    };
  }
  const same = eligibleRuns(all),
    withHr = same.filter((r) => Number(r.hr) > 0),
    withFeel = same.filter((r) => Number(r.feel) > 0),
    cad = all.filter((r) => Number(r.cadence) > 0);
  if (type === "pace") {
    if (same.length < 2)
      return {
        title: "Aún faltan carreras comparables",
        text: "La gráfica muestra tu ritmo, pero todavía no hay dos carreras de distancia parecida para comparar.",
        evidence: `${same.length} carreras en ${eligibleRangeLabel(all)}.`,
      };
    const split = Math.ceil(same.length / 2),
      earlier = same.slice(0, split),
      recent = same.slice(split),
      meanPace = (group) =>
        group.reduce((sum, r) => sum + r.duration / r.distance, 0) /
        group.length,
      oldPace = meanPace(earlier),
      newPace = meanPace(recent),
      delta = (oldPace - newPace) * 60,
      status =
        delta > 2
          ? `${Math.round(delta)} segundos por kilómetro más rápido`
          : delta < -2
            ? `${Math.round(Math.abs(delta))} segundos por kilómetro más lento`
            : "prácticamente igual";
    const meanMetric = (group, key) => {
      const values = group
        .map((r) => Number(r[key]))
        .filter((n) => Number.isFinite(n) && n > 0);
      return values.length
        ? {
            mean: values.reduce((a, b) => a + b, 0) / values.length,
            count: values.length,
          }
        : null;
    };
    const oldHr = meanMetric(earlier, "hr"),
      newHr = meanMetric(recent, "hr");
    let extras = "";
    if (oldHr && newHr)
      extras += ` El pulso medio pasó de ${Math.round(oldHr.mean)} a ${Math.round(newHr.mean)} lpm (${oldHr.count} y ${newHr.count} registros con pulso).`;
    return {
      title: `Ritmo medio: primeras ${earlier.length} frente a últimas ${recent.length}`,
      text: `En carreras de distancia parecida, el ritmo medio pasó de ${fmtPace(oldPace)} a ${fmtPace(newPace)} min/km: ${status}.${extras}`,
      evidence: `Comparación de ${same.length} carreras en ${eligibleRangeLabel(all)}, divididas cronológicamente. Es una tendencia descriptiva; no indica por sí sola la causa.`,
    };
  }
  if (type === "heart") {
    if (withHr.length < 2)
      return {
        title: "Faltan datos de pulso",
        text: "Necesitamos pulso medio en al menos dos carreras comparables para ver cómo coinciden ritmo y pulso.",
        evidence: `Ahora hay ${withHr.length} registros comparables con pulso.`,
      };
    const a = withHr[0],
      b = withHr.at(-1);
    return {
      title: "Ritmo y pulso, juntos",
      text: `El primer registro comparable fue ${fmtPace(a.duration / a.distance)} min/km a ${a.hr} lpm; el más reciente, ${fmtPace(b.duration / b.distance)} min/km a ${b.hr} lpm.`,
      evidence: `${withHr.length} carreras en ${eligibleRangeLabel(all)}. Describe una coincidencia, no su causa.`,
    };
  }
  if (type === "feel") {
    if (withFeel.length < 2)
      return {
        title: "Faltan sensaciones registradas",
        text: "Registra sensación del 1 al 10 para comparar cómo se sintió cada carrera junto con su ritmo.",
        evidence: `Ahora hay ${withFeel.length} carreras comparables con sensación.`,
      };
    const low = withFeel.filter((r) => Number(r.feel) <= 6),
      high = withFeel.filter((r) => Number(r.feel) >= 7);
    if (low.length < 2 || high.length < 2) {
      const n = [...withFeel].reverse().find((r) => r.note?.trim());
      return {
        title: "Aún hay pocos datos por grupo",
        text: `Hay ${low.length} carreras con sensación 1–6 y ${high.length} con sensación 7–10; faltan datos para comparar grupos.${n ? ` Nota reciente: “${n.note}”` : ""}`,
        evidence: `${withFeel.length} registros comparables. Sensación es subjetiva y no equivale a esfuerzo percibido.`,
      };
    }
    const avg = (g) =>
      g.reduce((s, r) => s + r.duration / r.distance, 0) / g.length;
    return {
      title: "Sensación y ritmo",
      text: `El ritmo medio fue ${fmtPace(avg(low))} min/km en el grupo 1–6 y ${fmtPace(avg(high))} en el grupo 7–10.`,
      evidence: `${low.length} y ${high.length} carreras, respectivamente. Es una asociación descriptiva.`,
    };
  }
  if (type === "cadencepace") {
    const runs = same.filter((run) => Number(run.cadence) > 0);
    return {
      title: "Tu cadencia según el ritmo",
      text:
        runs.length >= 2
          ? `Cada punto representa una de tus ${runs.length} carreras comparables con cadencia registrada. Mira cómo se mueve tu cadencia junto con el ritmo, sin buscar un número universal.`
          : "Registra cadencia en al menos dos carreras de distancia parecida para comparar su relación con tu ritmo.",
      evidence: `${runs.length} carreras con cadencia en el grupo comparable; la cadencia también cambia con la velocidad.`,
    };
  }
  if (type === "effort") {
    const runs = same.filter((run) => Number(run.rpe) > 0);
    return {
      title: "Esfuerzo declarado y ritmo",
      text:
        runs.length >= 2
          ? `Cada punto conecta el esfuerzo que reportaste con el ritmo de esa carrera. Compara tus propias salidas; esta escala es distinta de la sensación de qué tan bien te sentiste.`
          : "El esfuerzo percibido es opcional y va separado de la sensación. Regístralo en dos carreras comparables para ver esta relación.",
      evidence: `${runs.length} carreras comparables con esfuerzo registrado; es una descripción personal, no una medida clínica.`,
    };
  }
  if (type === "elevation") {
    const runs = same.filter(
      (run) =>
        run.elevationGain !== null &&
        run.elevationGain !== undefined &&
        Number.isFinite(Number(run.elevationGain)) &&
        Number(run.elevationGain) >= 0,
    );
    return {
      title: "Desnivel y ritmo en distancias parecidas",
      text:
        runs.length >= 2
          ? `Hay ${runs.length} carreras comparables con desnivel registrado. La vista permite revisar si los ritmos aparecen en recorridos con distinto ascenso, sin atribuir el cambio únicamente a las subidas.`
          : "Registra el desnivel positivo en al menos dos carreras de distancia parecida para explorar esta relación.",
      evidence: `${runs.length} carreras comparables con desnivel; el ascenso total no describe dónde ni qué tan inclinadas fueron las subidas.`,
    };
  }
  if (type === "weekly") {
    const weeks = new Map();
    for (const run of all) {
      const day = new Date(`${run.date}T12:00:00`);
      if (Number.isNaN(+day) || Number(run.distance) <= 0) continue;
      day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
      const key = day.toISOString().slice(0, 10),
        week = weeks.get(key) || { km: 0, count: 0 };
      week.km += Number(run.distance);
      week.count++;
      weeks.set(key, week);
    }
    const recent = [...weeks.values()];
    if (!recent.length)
      return {
        title: "Semanas de running",
        text: "Añade carreras con fecha para ver tu frecuencia semanal.",
        evidence: "Se cuentan solo carreras guardadas.",
      };
    const latest = recent.at(-1),
      previous = recent.at(-2);
    return {
      title: "Distancia y frecuencia semanal",
      text: `La semana más reciente del historial tiene ${latest.count} ${latest.count === 1 ? "salida" : "salidas"} y ${latest.km.toFixed(1)} km.${previous ? ` La semana anterior registrada tuvo ${previous.count} ${previous.count === 1 ? "salida" : "salidas"} y ${previous.km.toFixed(1)} km.` : ""}`,
      evidence:
        "Agrupa por semana calendario; semanas parciales o sin registros pueden cambiar la comparación.",
    };
  }
  if (type === "speed") {
    if (same.length < 2)
      return {
        title: "Aún faltan carreras comparables",
        text: "La velocidad se calcula con la distancia y la duración. Hacen falta dos carreras parecidas para ver si sube.",
        evidence: `${same.length} carreras en ${eligibleRangeLabel(all)}.`,
      };
    const speed = (run) => (run.distance / run.duration) * 60,
      split = Math.ceil(same.length / 2),
      mean = (group) =>
        group.reduce((sum, run) => sum + speed(run), 0) / group.length,
      earlier = mean(same.slice(0, split)),
      recent = mean(same.slice(split));
    return {
      title: "Velocidad en carreras parecidas",
      text: `La velocidad media pasó de ${earlier.toFixed(1)} a ${recent.toFixed(1)} km/h. Es el mismo dato que el ritmo, expresado al revés: más kilómetros por hora es más rápido.`,
      evidence: `${same.length} carreras en ${eligibleRangeLabel(all)}.`,
    };
  }
  if (type === "distances") {
    const goalKm = goalStore.getGoal().distanceKm,
      runs = all.filter((run) => Number(run.distance) > 0),
      longest = Math.max(...runs.map((run) => Number(run.distance)), 0);
    return {
      title: "Distancia de cada salida",
      text: runs.length
        ? `Cada barra es una carrera. La más larga es ${longest.toFixed(1)} km y tu meta es ${goalKm} km.`
        : "Añade carreras para ver la distancia de cada una.",
      evidence: `${runs.length} carreras del historial. La línea marca la distancia de la meta, no un ritmo.`,
    };
  }
  if (type === "days") {
    const weeks = new Map();
    for (const run of all) {
      const day = new Date(`${run.date}T12:00:00`);
      if (Number.isNaN(+day) || !run.date) continue;
      day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
      const key = day.toISOString().slice(0, 10),
        item = weeks.get(key) || new Set();
      item.add(run.date);
      weeks.set(key, item);
    }
    const recent = [...weeks.values()],
      latest = recent.at(-1);
    return {
      title: "Días con carrera",
      text: latest
        ? `La semana más reciente del historial tiene ${latest.size} ${latest.size === 1 ? "día" : "días"} con carrera.`
        : "Añade carreras con fecha para ver en qué semanas saliste.",
      evidence: `${recent.length} semanas con al menos una carrera. Un día con dos salidas cuenta una vez.`,
    };
  }
  if (cad.length < 2)
    return {
      title: "Faltan datos de cadencia",
      text: "La cadencia solo aparece si la registras en tus carreras; no se estima cuando falta.",
      evidence: `Ahora hay ${cad.length} registros con cadencia.`,
    };
  const a = cad[0],
    b = cad.at(-1);
  return {
    title: "Cadencia en tus carreras",
    text: `En los registros con cadencia, pasó de ${Math.round(a.cadence)} a ${Math.round(b.cadence)} pasos por minuto.`,
    evidence: `Basado en ${cad.length} registros. La gráfica describe tu historial; no propone una cadencia ideal.`,
  };
}
export function renderCarousel(all) {
  ensureDots();
  ensureRange();
  const view = viewRuns(all);
  const goal = goalStore.getGoal();
  const goalPace = goal.durationMinutes / goal.distanceKm;
  const goalSpeed = (goal.distanceKm / goal.durationMinutes) * 60;
  const paceGroup = getComparableRunGroup(view);
  const goalMatchesPaceGroup =
    Math.abs(paceGroup.centerKm - goal.distanceKm) <=
    Math.max(0.25, goal.distanceKm * 0.05);
  const spec = chartSpecs.find((s) => s.id === activeChart) || chartSpecs[0];
  document.getElementById("chartTitle").textContent = spec.title;
  const desc = describeChart(view, activeChart);
  document.getElementById("chartInsightTitle").textContent = desc.title;
  document.getElementById("chartInsightText").textContent = desc.text;
  const wrap = document.getElementById("chartSwipe"),
    canvas = document.getElementById("paceChart"),
    isDash = activeChart === "resumen";
  wrap.classList.toggle("is-dash", isDash);
  canvas.hidden = isDash;
  canvas.setAttribute("aria-hidden", String(isDash));
  if (isDash) renderSignalDash(view);
  const legend = document.getElementById("chartLegend");
  legend.innerHTML = isDash
    ? ""
    : activeChart === "pace"
      ? `<span><i class="key"></i>Ritmo medio</span>${goalMatchesPaceGroup ? `<span><i class="key orange"></i>Meta: ${fmtPace(goalPace)} min/km</span>` : ""}`
      : activeChart === "speed"
        ? `<span><i class="key"></i>Kilómetros por hora</span>${goalMatchesPaceGroup ? `<span><i class="key orange"></i>Meta: ${goalSpeed.toFixed(1)} km/h</span>` : ""}`
        : activeChart === "distances"
          ? `<span><i class="key"></i>Kilómetros de cada salida</span><span><i class="key orange"></i>Meta: ${goal.distanceKm} km</span>`
          : activeChart === "days"
            ? '<span><i class="key"></i>Días con carrera en la semana</span>'
            : activeChart === "heart"
              ? '<span><i class="key teal"></i>Un punto por carrera comparable</span>'
              : '<span><i class="key"></i>Esfuerzo declarado (1–10)</span>';
  if (isDash) {
    document
      .querySelectorAll(".carousel-tab")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.chart === activeChart)),
      );
    return;
  }
  if (activeChart === "pace")
    drawLineMetric(
      paceGroup.runs.map((r) => ({ ...r, pace: r.duration / r.distance })),
      "pace",
      goalMatchesPaceGroup ? goalPace : null,
      "#176b52",
    );
  else if (activeChart === "speed")
    drawLineMetric(
      paceGroup.runs.map((r) => ({
        ...r,
        speed: (r.distance / r.duration) * 60,
      })),
      "speed",
      goalMatchesPaceGroup ? goalSpeed : null,
      "#176b52",
      true,
    );
  else if (activeChart === "distances") drawDistanceBars(view);
  else if (activeChart === "days") drawRunDays(view);
  else if (activeChart === "cadence")
    drawLineMetric(view, "cadence", null, "#176b52");
  else if (activeChart === "weekly") drawWeekly(view);
  else drawScatter(view, activeChart);
  document
    .querySelectorAll(".carousel-tab")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.chart === activeChart)),
    );
}
function showChart(id) {
  if (!chartSpecs.some((s) => s.id === id)) return;
  activeChart = id;
  const wrap = document.getElementById("chartSwipe");
  wrap.classList.add("fading");
  setTimeout(() => {
    renderActiveChart(chartRuns());
    wrap.classList.remove("fading");
  }, 90);
}
let renderActiveChart = renderCarousel;
export const getRenderCarousel = () => renderActiveChart;
export const setRenderCarousel = (renderer) => {
  renderActiveChart = renderer;
};
export const renderCurrentCarousel = (all = chartRuns()) =>
  renderActiveChart(all);
window.addEventListener("ritmo-runs-updated", () =>
  renderCurrentCarousel(chartRuns()),
);
window.addEventListener("resize", () => renderCurrentCarousel(chartRuns()));
renderCurrentCarousel(chartRuns());
let touchStart = 0;
document.getElementById("chartSwipe").addEventListener(
  "touchstart",
  (e) => {
    touchStart = e.changedTouches[0].clientX;
  },
  { passive: true },
);
document.getElementById("chartSwipe").addEventListener(
  "touchend",
  (e) => {
    const delta = e.changedTouches[0].clientX - touchStart;
    if (Math.abs(delta) > 45) {
      const i = chartSpecs.findIndex((s) => s.id === activeChart),
        step = delta < 0 ? 1 : -1;
      showChart(
        chartSpecs[(i + step + chartSpecs.length) % chartSpecs.length].id,
      );
    }
  },
  { passive: true },
);
