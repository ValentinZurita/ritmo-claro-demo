// File map: renders auditable chart summaries using isolated running metrics.

import { summarizeRunningProgress } from "./analytics/summary.js";
import { runStore } from "./data/run-store.js";
import { formatDistanceGroup } from "./analytics/comparable-runs.js";
import { formatPace as fmtPace } from "./data/format.js";

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

function renderAuditableAnalyses(records) {
  const summary = summarizeRunningProgress(records);
  const bandLabel = formatDistanceGroup(summary.distanceGroup);
  const cards = [];

  if (summary.pace.count >= 2) {
    const trend = {
      improved: "mejoró",
      slower: "fue más lento",
      similar: "se mantuvo parecido",
    }[summary.pace.trend];
    cards.push(
      `<article class="analysis-row"><div class="analysis-icon">↗</div><div><strong>Ritmo en distancias similares</strong><p>Entre la primera y la última carrera comparable, el ritmo ${trend}: ${fmtPace(summary.pace.firstMinPerKm)} frente a ${fmtPace(summary.pace.latestMinPerKm)} min/km.</p><small>Se comparan ${summary.pace.count} carreras de ${bandLabel}. Tu meta se muestra aparte y no altera estos registros.</small></div></article>`,
    );
  } else {
    cards.push(
      `<article class="analysis-row"><div class="analysis-icon">↗</div><div><strong>Ritmo en distancias similares</strong><p>Hay ${summary.pace.count} carreras en el grupo más representado (${bandLabel}). Se necesitan al menos dos para mostrar una tendencia.</p><small>Tu meta es contexto; la comparación usa las distancias registradas.</small></div></article>`,
    );
  }

  if (summary.heartRate.count >= 2) {
    const first = summary.heartRate.first;
    const latest = summary.heartRate.latest;
    cards.push(
      `<article class="analysis-row"><div class="analysis-icon orange">♡</div><div><strong>Ritmo y pulso, juntos</strong><p>En las carreras comparables, el registro más reciente fue ${fmtPace(latest.duration / latest.distance)} min/km con ${latest.hr} lpm; el primero fue ${fmtPace(first.duration / first.distance)} con ${first.hr} lpm.</p><small>Hay ${summary.heartRate.count} pares de datos. Es una comparación descriptiva, no una explicación causal.</small></div></article>`,
    );
  } else {
    cards.push(
      `<article class="analysis-row"><div class="analysis-icon orange">♡</div><div><strong>Ritmo y pulso</strong><p>Necesitamos dos carreras de distancia parecida con pulso registrado para contrastarlos.</p><small>Ahora hay ${summary.heartRate.count} registros comparables con pulso.</small></div></article>`,
    );
  }

  if (summary.feeling.lowCount >= 2 && summary.feeling.highCount >= 2) {
    cards.push(
      `<article class="analysis-row"><div class="analysis-icon yellow">☼</div><div><strong>Sensación y ritmo</strong><p>El ritmo medio fue ${fmtPace(summary.feeling.lowAverageMinPerKm)} min/km con sensación 1–6 y ${fmtPace(summary.feeling.highAverageMinPerKm)} con sensación 7–10.</p><small>${summary.feeling.lowCount} carreras en sensación baja y ${summary.feeling.highCount} en alta; la sensación no explica por sí sola el ritmo.</small></div></article>`,
    );
  } else {
    const note = summary.latestNote?.note;
    cards.push(
      `<article class="analysis-row"><div class="analysis-icon yellow">☼</div><div><strong>Sensación y notas</strong><p>Aún no hay al menos dos carreras en cada grupo de sensación para comparar ritmos.${note ? ` La nota más reciente dice: “${escapeHtml(note)}”` : ""}</p><small>La app evita sacar conclusiones con grupos demasiado pequeños.</small></div></article>`,
    );
  }

  document.getElementById("analysisCards").innerHTML = cards.join("");
}

const renderCurrentAnalyses = () =>
  renderAuditableAnalyses(runStore.listRunsSorted());
window.addEventListener("ritmo-runs-updated", renderCurrentAnalyses);
renderCurrentAnalyses();
