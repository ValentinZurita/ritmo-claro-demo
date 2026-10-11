// File map: dashboard summary and run-entry interactions using the run store.

import { isCloudAccount } from "./data/account.js";
import { runKey } from "./data/run-key.js";
import { seedExtras } from "./data/sample-runs.js";
import { runStore } from "./data/run-store.js";
import {
  goalStore,
  getGoalDistanceBand,
  runsNearGoalDistance,
} from "./data/goal-store.js";
import { formatDate as fmtDate, formatPace as fmtPace } from "./data/format.js";

const RUNS_PER_BATCH = 5;
let visibleRunCount = RUNS_PER_BATCH;
const $ = (id) => document.getElementById(id);
export const sorted = () => runStore.listRunsSorted();
function renderRunList(all) {
  const newestFirst = all.slice().reverse(),
    visibleRuns = newestFirst.slice(0, visibleRunCount),
    list = $("runList");
  list.innerHTML =
    visibleRuns
      .map(
        (r) =>
          `<div class="run"><div><div class="runname">${r.distance.toFixed(1)} km</div><div class="runmeta">${fmtDate(r.date)}${r.feel ? ` · sensación ${r.feel}/10` : ""}${r.rpe ? ` · esfuerzo ${r.rpe}/10` : ""}${r.elevationGain ? ` · +${Math.round(r.elevationGain)} m` : ""}${r.caloriesKcal ? ` · ${Math.round(r.caloriesKcal)} kcal estimadas por la app` : ""}${r.note?.startsWith("[EJEMPLO]") ? " · prueba" : ""}</div></div><div class="runpace">${fmtPace(r.duration / r.distance)}<small>min / km · ${((r.distance / r.duration) * 60).toFixed(1)} km/h</small></div></div>`,
      )
      .join("") ||
    '<div class="empty">Aún no hay carreras. Añade una para empezar.</div>';
}
export function draw() {
  const all = sorted(),
    goal = goalStore.getGoal(),
    goalDistance = goal.distanceKm,
    goalDistanceLabel = new Intl.NumberFormat("es-MX", {
      maximumFractionDigits: 1,
    }).format(goalDistance),
    longest = Math.max(...all.map((r) => r.distance), 0);
  $("today").textContent = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  $("longest").innerHTML =
    `${longest.toFixed(1)} km<span>mayor distancia registrada</span>`;
  $("progressLabel").textContent =
    `${Math.min(100, Math.round((longest / goalDistance) * 100))}% de ${goalDistanceLabel} km`;
  $("progressBar").style.width =
    `${Math.min(100, (longest / goalDistance) * 100)}%`;
  renderRunList(all);
  const comparable = runsNearGoalDistance(all, goalDistance);
  const band = getGoalDistanceBand(goalDistance);
  const rangeLabel = `${band.min.toFixed(1)}–${band.max.toFixed(1)} km`;
  if (comparable.length >= 2) {
    const first = comparable[0],
      last = comparable[comparable.length - 1],
      delta = first.duration / first.distance - last.duration / last.distance;
    $("insightTitle").textContent =
      delta > 0.03
        ? `Tu ritmo en carreras cercanas a ${goalDistanceLabel} km va mejorando`
        : delta < -0.03
          ? `Tu ritmo en carreras cercanas a ${goalDistanceLabel} km ha bajado`
          : `Tu ritmo en carreras cercanas a ${goalDistanceLabel} km se mantiene parecido`;
    $("insightText").textContent =
      `Entre la primera y la última de tus carreras de distancia parecida, el ritmo medio ${delta > 0.03 ? "mejoró" : delta < -0.03 ? "fue más lento" : "se mantuvo similar"}: ${fmtPace(first.duration / first.distance)} frente a ${fmtPace(last.duration / last.distance)} min/km.${first.hr && last.hr ? ` El pulso medio fue ${first.hr} y ${last.hr} latidos por minuto, respectivamente.` : ""}`;
    $("evidenceText").textContent =
      `Basado en ${comparable.length} carreras de ${rangeLabel}, alrededor de tu distancia objetivo. Es una comparación descriptiva; no establece causas.`;
  } else {
    $("insightTitle").textContent = "Aún faltan carreras comparables";
    $("insightText").textContent =
      "Cuando haya más registros de distancias parecidas, podremos mostrar una tendencia con mejor contexto.";
    $("evidenceText").textContent =
      `Ahora hay ${comparable.length} carreras entre ${rangeLabel}; se necesitan al menos dos para comparar una tendencia.`;
  }
  $("sampleCount").textContent =
    `${all.length} ${all.length === 1 ? "carrera" : "carreras"}`;
  window.dispatchEvent(new Event("ritmo-runs-updated"));
}
$("runList").addEventListener("scroll", (event) => {
  const list = event.currentTarget,
    totalRuns = runStore.listRuns().length,
    reachedEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 24;
  if (!reachedEnd || visibleRunCount >= totalRuns) return;
  visibleRunCount = Math.min(visibleRunCount + RUNS_PER_BATCH, totalRuns);
  renderRunList(sorted());
});
function savedMessage() {
  return isCloudAccount()
    ? "Carrera guardada en tu Drive"
    : "Carrera guardada en este dispositivo";
}

export function openRunEditor() {
  const t = new Date();
  $("date").value = t.toISOString().slice(0, 10);
  $("modal").classList.add("open");
  $("distance").focus();
}
function close({ saved = false } = {}) {
  $("modal").classList.remove("open");
  if (!saved) window.dispatchEvent(new Event("ritmo-run-editor-closed"));
}
$("addRun").onclick = openRunEditor;
$("closeModal").onclick = close;
$("cancel").onclick = close;
$("modal").onclick = (e) => {
  if (e.target === $("modal")) close();
};
$("runForm").onsubmit = (e) => {
  e.preventDefault();
  const v = (id) => $(id).value;
  const run = {
    date: v("date"),
    distance: Number(v("distance")),
    duration: Number(v("duration")),
    hr: v("hr") ? Number(v("hr")) : null,
    feel: v("feel") ? Number(v("feel")) : null,
    cadence: v("cadence") ? Number(v("cadence")) : null,
    rpe: v("rpe") ? Number(v("rpe")) : null,
    elevationGain: v("elevationGain") ? Number(v("elevationGain")) : null,
    caloriesKcal: v("caloriesKcal") ? Number(v("caloriesKcal")) : null,
    note: v("note").trim(),
  };
  runStore.addRuns([run]);
  draw();
  close({ saved: true });
  e.target.reset();
  $("toast").textContent = savedMessage();
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2200);
  window.dispatchEvent(new Event("ritmo-run-saved"));
};
const addSampleRunsButton = $("addSampleRuns"),
  missingSamples = () => {
    const existing = runStore.listRuns();
    return seedExtras.filter(
      (sample) => !existing.some((run) => runKey(run) === runKey(sample)),
    );
  };
if (addSampleRunsButton) {
  const updateSampleButton = () => {
    if (isCloudAccount()) {
      addSampleRunsButton.hidden = true;
      return;
    }
    const n = missingSamples().length;
    addSampleRunsButton.hidden = n === 0;
    addSampleRunsButton.textContent = `Añadir ${n || seedExtras.length} carreras de prueba`;
  };
  updateSampleButton();
  addSampleRunsButton.onclick = () => {
    const additions = missingSamples();
    if (!additions.length) return updateSampleButton();
    if (
      !confirm(
        `Se añadirán ${additions.length} carreras ficticias al historial para probar las gráficas. Quedarán marcadas como “prueba”. ¿Continuar?`,
      )
    )
      return;
    runStore.addRuns(additions);
    draw();
    updateSampleButton();
    $("toast").textContent = `${additions.length} carreras ficticias añadidas`;
    $("toast").classList.add("show");
    setTimeout(() => {
      $("toast").classList.remove("show");
      $("toast").textContent = savedMessage();
    }, 2400);
  };
}
draw();
window.addEventListener("ritmo-goal-updated", draw);
