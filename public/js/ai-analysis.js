// File map: AI request, provider connection, and interpretation UI.

import {
  graphCharts,
  chartRuns,
  getActiveChart,
  getRenderCarousel,
  renderCurrentCarousel,
  setActiveChart,
  setRenderCarousel,
} from "./dashboard.js";
import { formatDate as fmtDate, formatPace as fmtPace } from "./data/format.js";
import { goalStore } from "./data/goal-store.js";
import { readSession } from "./data/account.js";
import { getComparableRunGroup } from "./analytics/comparable-runs.js";
import { appLocale, isEnglish } from "./i18n.js";

(() => {
  // Bump promptVersion whenever either system prompt in worker.js changes, so old saved readings are not shown.
  const CONFIG = {
    modelId: "@cf/qwen/qwen3.8-27b",
    apiPath: "/api/interpret",
    promptVersion: "coach-v3",
    storagePrefix: "ritmo-claro-reading:",
  };
  const ui = {
    button: document.getElementById("modelAction"),
    status: document.getElementById("modelStatus") || { textContent: "" },
  };
  let analyzing = false,
    inferenceSeq = 0,
    aiSuggestedChart = null,
    aiSuggestedAnalysisKey = null;
  const resultCache = new Map(),
    resultSources = new Map(),
    inFlightKeys = new Set();
  function clientLimitKey() {
    let key = localStorage.getItem("ritmo-claro-rate-key");
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem("ritmo-claro-rate-key", key);
    }
    return key;
  }
  const providers = {
    rules: { id: "rules", interpret: async () => null },
    cloud: {
      id: "cloud",
      interpret: async (messages) => {
        const response = await fetch(CONFIG.apiPath, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-client-key": clientLimitKey(),
          },
          body: JSON.stringify({
            context: String(messages.at(-1)?.content || ""),
            language: isEnglish ? "en" : "es",
          }),
        });
        let payload = {};
        try {
          payload = await response.json();
        } catch {}
        if (!response.ok)
          throw new Error(
            payload.error || "Servicio de análisis no disponible",
          );
        ui.status.textContent = "Servicio disponible · sujeto a cuota";
        return String(payload.text || "");
      },
    },
  };
  function setActionLabel(text) {
    const label = ui.button?.querySelector(".ai-action-label");
    if (label) label.textContent = text;
    else if (ui.button) ui.button.textContent = text;
  }
  function setReading(text, placeholder = false) {
    const output = document.getElementById("aiInterpretationText"),
      goal = document.querySelector(".goal");
    if (!output) return;
    const hasText = Boolean(text);
    output.hidden = !hasText;
    output.textContent = hasText ? text : "";
    output.classList.toggle("ai-placeholder", placeholder);
    goal?.classList.toggle("has-reading", hasText && !placeholder);
    goal?.classList.toggle("is-busy", placeholder);
  }
  function showChartThinking(_title, detail) {
    setReading(detail, true);
  }
  // One model reading per set of runs and goal; a new run or goal edit makes the button available again.
  function hasModelReading() {
    return resultSources.get(cacheKey("all", chartRuns())) === "model";
  }
  function updateControls() {
    const readOnce = hasModelReading();
    ui.button.disabled = analyzing || readOnce;
    ui.button.classList.toggle("is-busy", analyzing);
    if (analyzing) {
      setActionLabel("Analizando…");
      return;
    }
    if (readOnce) {
      setActionLabel("Análisis al día");
      return;
    }
    setActionLabel(
      resultCache.has(cacheKey("all", chartRuns()))
        ? "Reintentar análisis"
        : "Analizar con IA",
    );
  }
  function extractObject(text) {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  // Provider-neutral tool contracts (name, description, JSON schema, callback). The browser orchestrator runs a small chart-specific plan before inference; this demo does not depend on Strands or ask the tiny model to emit fragile tool-call syntax. A future Strands/provider adapter can translate this registry.
  const toolChartSchema = {
    type: "object",
    properties: {
      chart_id: { type: "string", enum: graphCharts.map((s) => s.id) },
    },
    required: ["chart_id"],
    additionalProperties: false,
  };
  const runningReferenceCatalog = [
    {
      distance_km: 5,
      label: "5 km",
      source: "RunRepeat race-finish-time comparison",
      population:
        "Recreational race finishers; source reports more than 35 million results from over 28,000 races across 20 years; elite athletes excluded.",
      available_context:
        "Published finish-time percentile distributions overall and by sex; the calculator says age-group comparisons are available, but per-cell sample sizes and full age-by-sex tables are not documented on the public page.",
      url: "https://runrepeat.com/uk/how-do-you-masure-up-the-runners-percentile-calculator",
      limits: "Race results only; not training runs or all people who run.",
    },
    {
      distance_km: 10,
      label: "10 km",
      source: "RunRepeat race-finish-time comparison",
      population:
        "Recreational race finishers; source reports more than 35 million results from over 28,000 races across 20 years; elite athletes excluded.",
      available_context:
        "Published finish-time percentile distributions overall and by sex; the calculator says age-group comparisons are available, but per-cell sample sizes and full age-by-sex tables are not documented on the public page.",
      url: "https://runrepeat.com/uk/how-do-you-masure-up-the-runners-percentile-calculator",
      limits: "Race results only; not training runs or all people who run.",
    },
    {
      distance_km: 21.0975,
      label: "Medio maratón",
      source: "RunRepeat race-finish-time comparison",
      population:
        "Recreational race finishers; source reports more than 35 million results from over 28,000 races across 20 years; elite athletes excluded.",
      available_context:
        "Published finish-time percentile distributions overall and by sex; the calculator says age-group comparisons are available, but per-cell sample sizes and full age-by-sex tables are not documented on the public page.",
      url: "https://runrepeat.com/uk/how-do-you-masure-up-the-runners-percentile-calculator",
      limits: "Race results only; not training runs or all people who run.",
    },
    {
      distance_km: 42.195,
      label: "Maratón",
      source: "RunRepeat race-finish-time comparison",
      population:
        "Recreational race finishers; source reports more than 35 million results from over 28,000 races across 20 years; elite athletes excluded.",
      available_context:
        "Published finish-time percentile distributions overall and by sex; the calculator says age-group comparisons are available, but per-cell sample sizes and full age-by-sex tables are not documented on the public page.",
      url: "https://runrepeat.com/uk/how-do-you-masure-up-the-runners-percentile-calculator",
      limits: "Race results only; not training runs or all people who run.",
    },
    {
      distance_km: 1,
      label: "1 km / 1000 m",
      source: "World Masters Athletics age-grading track factors (2023)",
      population:
        "Published age- and sex-specific performance factors for the 1000 m track event.",
      available_context:
        "A performance-standard comparison, not a recreational-runners average, percentile, or distribution of finishers.",
      url: "https://world-masters-athletics.org/wp-content/uploads/2023/02/2023-WMA-Appendix-B.pdf",
      limits:
        "Do not describe as what a typical runner of that age or sex does; keep separate from population percentiles.",
    },
  ];
  const runningTools = {
    compare_pace_periods: {
      name: "compare_pace_periods",
      description:
        "Compara la primera y segunda mitad del grupo de distancias con más registros. Devuelve estadísticas descriptivas, muestras y tendencia; no depende de la meta.",
      inputSchema: toolChartSchema,
      run(all) {
        const runs = eligibleRuns(all);
        if (runs.length < 2)
          return {
            sample_count: runs.length,
            available: false,
            reason: "Se necesitan al menos dos carreras comparables.",
          };
        const cut = Math.ceil(runs.length / 2),
          first = runs.slice(0, cut),
          last = runs.slice(cut),
          avg = (xs, fn) =>
            xs.length ? xs.reduce((s, r) => s + fn(r), 0) / xs.length : null,
          pace = (xs) => avg(xs, (r) => r.duration / r.distance),
          metric = (xs, k) => {
            const v = xs.filter((r) => Number(r[k]) > 0);
            return {
              mean: v.length ? avg(v, (r) => Number(r[k])) : null,
              sample_count: v.length,
            };
          };
        return {
          available: true,
          definition:
            "Promedio aritmético de min/km, separado cronológicamente; no implica causalidad.",
          sample_count: runs.length,
          early: {
            count: first.length,
            pace_min_km: pace(first),
            heart_rate_bpm: metric(first, "hr"),
            perceived_effort_1_to_10: metric(first, "rpe"),
          },
          recent: {
            count: last.length,
            pace_min_km: pace(last),
            heart_rate_bpm: metric(last, "hr"),
            perceived_effort_1_to_10: metric(last, "rpe"),
          },
          pace_change_seconds_per_km: (pace(first) - pace(last)) * 60,
        };
      },
    },
    compare_pace_and_hr: {
      name: "compare_pace_and_hr",
      description:
        "Resume ritmo y pulso en carreras comparables con pulso registrado; solo describe coincidencias.",
      inputSchema: toolChartSchema,
      run(all) {
        const runs = eligibleRuns(all).filter((r) => Number(r.hr) > 0);
        if (runs.length < 2)
          return {
            available: false,
            sample_count: runs.length,
            reason: "Faltan al menos dos carreras comparables con pulso.",
          };
        const a = runs[0],
          b = runs.at(-1),
          pace = (r) => r.duration / r.distance;
        return {
          available: true,
          definition:
            "Primer y último registro cronológicos con pulso; asociación descriptiva, no explica causas.",
          sample_count: runs.length,
          first: {
            date: a.date,
            pace_min_km: pace(a),
            heart_rate_bpm: Number(a.hr),
          },
          latest: {
            date: b.date,
            pace_min_km: pace(b),
            heart_rate_bpm: Number(b.hr),
          },
          pace_change_seconds_per_km: (pace(a) - pace(b)) * 60,
          heart_rate_change_bpm: Number(b.hr) - Number(a.hr),
        };
      },
    },
    compare_feel_groups: {
      name: "compare_feel_groups",
      description:
        "Compara ritmo medio de carreras con sensación 1–6 y 7–10; exige dos registros en cada grupo.",
      inputSchema: toolChartSchema,
      run(all) {
        const runs = eligibleRuns(all).filter((r) => Number(r.feel) > 0),
          low = runs.filter((r) => Number(r.feel) <= 6),
          high = runs.filter((r) => Number(r.feel) >= 7),
          pace = (xs) =>
            xs.length
              ? xs.reduce((s, r) => s + r.duration / r.distance, 0) / xs.length
              : null;
        return {
          available: low.length >= 2 && high.length >= 2,
          definition:
            "Grupos descriptivos según sensación declarada; sensación no equivale a esfuerzo medido.",
          sample_count: runs.length,
          lower_feel: {
            range: "1–6",
            count: low.length,
            mean_pace_min_km: pace(low),
          },
          higher_feel: {
            range: "7–10",
            count: high.length,
            mean_pace_min_km: pace(high),
          },
          reason:
            low.length < 2 || high.length < 2
              ? "Aún no hay dos carreras en cada grupo para comparar."
              : undefined,
        };
      },
    },
    summarize_cadence: {
      name: "summarize_cadence",
      description:
        "Resume la cadencia registrada y su cambio entre primer y último dato disponible.",
      inputSchema: toolChartSchema,
      run(all) {
        const runs = all.filter((r) => Number(r.cadence) > 0);
        if (runs.length < 2)
          return {
            available: false,
            sample_count: runs.length,
            reason: "Faltan al menos dos carreras con cadencia.",
          };
        return {
          available: true,
          definition:
            "Primer y último dato de cadencia disponible; no se compara con un valor ideal.",
          sample_count: runs.length,
          first_spm: Number(runs[0].cadence),
          latest_spm: Number(runs.at(-1).cadence),
          change_spm: Number(runs.at(-1).cadence) - Number(runs[0].cadence),
        };
      },
    },
    summarize_latest_run: {
      name: "summarize_latest_run",
      description:
        "Compara la carrera más reciente con registros anteriores de distancia parecida y calcula la diferencia de ritmo frente a la meta solo como contexto, nunca como pronóstico.",
      inputSchema: toolChartSchema,
      run(all) {
        const runs = [...all]
            .filter(
              (run) => Number(run.distance) > 0 && Number(run.duration) > 0,
            )
            .sort((a, b) => a.date.localeCompare(b.date)),
          latest = runs.at(-1);
        if (!latest)
          return { available: false, reason: "No hay carreras registradas." };
        const distance = Number(latest.distance),
          pace = Number(latest.duration) / distance,
          tolerance = Math.max(0.05, distance * 0.05),
          previous = runs
            .slice(0, -1)
            .filter(
              (run) => Math.abs(Number(run.distance) - distance) <= tolerance,
            ),
          mean = (key) => {
            const values = previous
              .map((run) => Number(run[key]))
              .filter((value) => Number.isFinite(value) && value > 0);
            return values.length
              ? values.reduce((total, value) => total + value, 0) /
                  values.length
              : null;
          },
          goal = goalStore.getGoal(),
          goalPace = goal.durationMinutes / goal.distanceKm,
          sameGoalDistance =
            Math.abs(distance - goal.distanceKm) <=
            Math.max(0.25, goal.distanceKm * 0.05);
        return {
          available: true,
          definition:
            "La última carrera cronológica frente al promedio de carreras anteriores dentro de un margen de distancia del 5% (mínimo 50 m). El ritmo objetivo solo se compara si la carrera es de la distancia de la meta; en otra distancia no es una referencia.",
          latest: {
            date: latest.date,
            distance_km: distance,
            duration_minutes: Number(latest.duration),
            pace_min_km: pace,
            heart_rate_bpm: Number(latest.hr) || null,
            feeling_1_to_10: Number(latest.feel) || null,
            cadence_spm: Number(latest.cadence) || null,
            perceived_effort_1_to_10: Number(latest.rpe) || null,
            elevation_gain_m: Number(latest.elevationGain) || null,
            app_reported_calories_kcal: Number(latest.caloriesKcal) || null,
            average_speed_kmh:
              Number(latest.distance) > 0 && Number(latest.duration) > 0
                ? (Number(latest.distance) / Number(latest.duration)) * 60
                : null,
            note: String(latest.note || "").slice(0, 180),
          },
          previous_similar_runs: {
            sample_count: previous.length,
            pace_min_km: previous.length
              ? previous.reduce(
                  (total, run) =>
                    total + Number(run.duration) / Number(run.distance),
                  0,
                ) / previous.length
              : null,
            heart_rate_bpm: mean("hr"),
            feeling_1_to_10: mean("feel"),
            cadence_spm: mean("cadence"),
            perceived_effort_1_to_10: mean("rpe"),
            elevation_gain_m: mean("elevationGain"),
          },
          goal_context: {
            target_distance_km: goal.distanceKm,
            target_duration_minutes: goal.durationMinutes,
            // Pace is compared with the goal only at the goal distance; otherwise it is not a like-for-like reference.
            same_distance_as_goal: sameGoalDistance,
            target_pace_min_km: sameGoalDistance ? goalPace : null,
            difference_seconds_per_km: sameGoalDistance
              ? (goalPace - pace) * 60
              : null,
            date: goal.date,
          },
        };
      },
    },
    summarize_goal_distance_exposure: {
      name: "summarize_goal_distance_exposure",
      description:
        "Compara las distancias registradas con la distancia de meta. Es una referencia descriptiva, nunca una evaluación de preparación.",
      inputSchema: toolChartSchema,
      run(all) {
        const targetKm = goalStore.getGoal().distanceKm,
          runs = all.filter((r) => Number(r.distance) > 0),
          longest = runs.reduce(
            (best, r) => (!best || r.distance > best.distance ? r : best),
            null,
          ),
          nearGoal = runs.filter((r) => r.distance >= targetKm * 0.8);
        return {
          available: runs.length > 0,
          target_distance_km: targetKm,
          runs_count: runs.length,
          longest_run_km: longest ? Number(longest.distance.toFixed(2)) : null,
          longest_run_date: longest?.date ?? null,
          longest_as_percent_of_goal: longest
            ? Math.round((longest.distance / targetKm) * 100)
            : null,
          runs_at_least_80_percent_of_goal: nearGoal.length,
          definition:
            "Exposición histórica a distancia; no permite concluir si alguien está listo ni recomienda un plan.",
        };
      },
    },
    summarize_run_rhythm: {
      name: "summarize_run_rhythm",
      description:
        "Describe la frecuencia, distancia y separación entre carreras en los últimos 28 días frente a los 28 días anteriores. No prescribe descansos ni planes.",
      inputSchema: toolChartSchema,
      run(all) {
        const runs = [...all]
            .filter(
              (run) =>
                Number(run.distance) > 0 &&
                Number(run.duration) > 0 &&
                Number.isFinite(Date.parse(`${run.date}T00:00:00Z`)),
            )
            .sort((a, b) => a.date.localeCompare(b.date)),
          latest = runs.at(-1);
        if (!latest)
          return { available: false, reason: "No hay fechas registradas." };
        const dayMs = 86400000,
          latestDay = Date.parse(`${latest.date}T00:00:00Z`),
          recentStart = latestDay - 28 * dayMs,
          priorStart = latestDay - 56 * dayMs,
          recent = runs.filter((run) => {
            const day = Date.parse(`${run.date}T00:00:00Z`);
            return day > recentStart && day <= latestDay;
          }),
          previous = runs.filter((run) => {
            const day = Date.parse(`${run.date}T00:00:00Z`);
            return day > priorStart && day <= recentStart;
          }),
          gaps = recent.slice(1).map((run, index) => {
            const previousDay = Date.parse(`${recent[index].date}T00:00:00Z`),
              currentDay = Date.parse(`${run.date}T00:00:00Z`);
            return Math.round((currentDay - previousDay) / dayMs);
          }),
          summarize = (periodRuns) => ({
            run_count: periodRuns.length,
            total_distance_km: Number(
              periodRuns
                .reduce((total, run) => total + Number(run.distance), 0)
                .toFixed(1),
            ),
            total_duration_minutes: Number(
              periodRuns
                .reduce((total, run) => total + Number(run.duration), 0)
                .toFixed(0),
            ),
          });
        const previousRunDay = runs.at(-2)
          ? Date.parse(`${runs.at(-2).date}T00:00:00Z`)
          : null;
        return {
          available: true,
          definition:
            "Conteo y volumen descriptivos en ventanas móviles de 28 días; no evalúa carga segura ni prescribe recuperación.",
          latest_run_date: latest.date,
          days_since_previous_recorded_run:
            previousRunDay === null
              ? null
              : Math.round((latestDay - previousRunDay) / dayMs),
          recent_28_days: summarize(recent),
          preceding_28_days: summarize(previous),
          recent_recorded_run_gaps_days: gaps,
          mean_gap_days:
            gaps.length > 0
              ? Number(
                  (
                    gaps.reduce((total, gap) => total + gap, 0) / gaps.length
                  ).toFixed(1),
                )
              : null,
        };
      },
    },
    reference_context: {
      name: "reference_context",
      description:
        "Aporta referencias externas por distancia como contexto para la explicación. Nunca ajusta ni reemplaza los datos, métricas o tendencias personales.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      run() {
        const goalDistance = goalStore.getGoal().distanceKm;
        const matchingReferences = runningReferenceCatalog.filter(
          (reference) =>
            Math.abs(reference.distance_km - goalDistance) <=
            Math.max(0.1, goalDistance * 0.02),
        );
        return {
          available: matchingReferences.length > 0,
          mode: "context_only",
          goal_distance_km: goalDistance,
          references: matchingReferences,
          guardrail: matchingReferences.length
            ? "Estas fuentes solo sirven para contrastar y explicar. No cambian ritmos, duraciones, meta ni otros resultados calculados. Distingue distribuciones de participantes de carrera y estándares de rendimiento."
            : "No hay una referencia cargada que coincida con esta distancia; no extrapoles datos de otra distancia ni inventes un rango.",
        };
      },
    },
    read_run_notes: {
      name: "read_run_notes",
      description:
        "Recupera notas recientes vinculadas a sus carreras y métricas asociadas para detectar temas recurrentes sin atribuirles causalidad.",
      inputSchema: toolChartSchema,
      run(all) {
        const runs = all
          .filter((r) => r.note?.trim())
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-30);
        return {
          available: runs.length > 0,
          sample_count: runs.length,
          notes: runs.map((r) => ({
            date: r.date,
            distance_km: Number(r.distance.toFixed(1)),
            pace_min_km: Number((r.duration / r.distance).toFixed(2)),
            heart_rate_bpm: r.hr ?? null,
            feel_1_to_10: r.feel ?? null,
            cadence_spm: r.cadence ?? null,
            perceived_effort_1_to_10: r.rpe ?? null,
            elevation_gain_m: r.elevationGain ?? null,
            app_reported_calories_kcal: r.caloriesKcal ?? null,
            note: String(r.note).slice(0, 180),
          })),
          reason: runs.length
            ? "Notas vinculadas a carreras; las marcadas como ejemplo son datos ficticios."
            : "No hay notas registradas.",
        };
      },
    },
  };
  function eligibleRuns(all) {
    return getComparableRunGroup(all).runs;
  }
  const chartToolPlan = {
    pace: [
      "compare_pace_periods",
      "compare_pace_and_hr",
      "read_run_notes",
      "reference_context",
    ],
    heart: [
      "compare_pace_and_hr",
      "compare_pace_periods",
      "read_run_notes",
      "reference_context",
    ],
    feel: [
      "compare_feel_groups",
      "compare_pace_periods",
      "read_run_notes",
      "reference_context",
    ],
    cadence: [
      "summarize_cadence",
      "compare_pace_periods",
      "read_run_notes",
      "reference_context",
    ],
    cadencepace: [
      "summarize_cadence",
      "compare_pace_periods",
      "read_run_notes",
      "reference_context",
    ],
    effort: ["compare_pace_periods", "read_run_notes", "reference_context"],
    weekly: [
      "summarize_run_rhythm",
      "summarize_latest_run",
      "read_run_notes",
      "reference_context",
    ],
    elevation: [
      "summarize_latest_run",
      "compare_pace_periods",
      "read_run_notes",
      "reference_context",
    ],
  };
  function runAnalysisTools(all, id) {
    const calls = [
      ...new Set(Object.values(chartToolPlan).flat()),
      "summarize_latest_run",
      "summarize_goal_distance_exposure",
      "summarize_run_rhythm",
    ];
    return calls.map((name) => {
      const tool = runningTools[name],
        args = { chart_id: id },
        result = tool.run(all, args);
      return { name, description: tool.description, result };
    });
  }
  function meanOf(metric) {
    return metric && metric.sample_count >= 2 && Number.isFinite(metric.mean)
      ? metric.mean
      : null;
  }
  function statisticianReading(periods) {
    if (!periods?.available)
      return {
        ritmo: "sin dato",
        pulso: "sin dato",
        esfuerzo: "sin dato",
        juicio: "faltan carreras parecidas",
        recomendacion:
          "Hace falta otra carrera de distancia parecida para comparar.",
      };
    const pace = periods.pace_change_seconds_per_km,
      ritmo = pace > 2 ? "más rápido" : pace < -2 ? "más lento" : "parecido",
      earlyHr = meanOf(periods.early.heart_rate_bpm),
      recentHr = meanOf(periods.recent.heart_rate_bpm),
      earlyEffort = meanOf(periods.early.perceived_effort_1_to_10),
      recentEffort = meanOf(periods.recent.perceived_effort_1_to_10),
      pulso =
        earlyHr == null || recentHr == null
          ? "sin dato"
          : recentHr - earlyHr > 2
            ? "más alto"
            : earlyHr - recentHr > 2
              ? "más bajo"
              : "parecido",
      esfuerzo =
        earlyEffort == null || recentEffort == null
          ? "sin dato"
          : recentEffort - earlyEffort > 0.4
            ? "más alto"
            : earlyEffort - recentEffort > 0.4
              ? "más bajo"
              : "parecido";
    let juicio = "parecido";
    if (
      ritmo === "más rápido" &&
      pulso !== "más alto" &&
      esfuerzo !== "más alto"
    )
      juicio = "vas bien";
    else if (
      ritmo === "más rápido" &&
      (pulso === "más alto" || esfuerzo === "más alto")
    )
      juicio = "vas más rápido, pero te costó más";
    else if (ritmo === "más lento") juicio = "vas peor";
    const recomendacion =
      esfuerzo === "sin dato"
        ? "Anota el esfuerzo del 1 al 10 en la próxima."
        : juicio === "vas peor"
          ? "Fíjate si las notas de las carreras más lentas repiten lo mismo."
          : juicio === "vas más rápido, pero te costó más"
            ? "Mira si el ritmo sigue bajando de min/km con el esfuerzo igual."
            : "";
    return { ritmo, pulso, esfuerzo, juicio, recomendacion };
  }
  function movementReport(periods, rhythm) {
    const reading = statisticianReading(periods),
      runs = chartRuns()
        .filter((run) => Number(run.distance) > 0)
        .sort((a, b) => a.date.localeCompare(b.date)),
      items = [];
    if (periods?.available) {
      items.push({
        nombre: "ritmo",
        estado:
          reading.ritmo === "más rápido"
            ? "mejorando"
            : reading.ritmo === "más lento"
              ? "empeorando"
              : "estancado",
        frase: `el ritmo en carreras parecidas pasó de ${fmtPace(periods.early.pace_min_km)} a ${fmtPace(periods.recent.pace_min_km)} min/km`,
      });
    }
    if (
      reading.pulso === "más bajo" ||
      reading.pulso === "más alto" ||
      reading.pulso === "parecido"
    ) {
      const earlyHr = periods.early.heart_rate_bpm,
        recentHr = periods.recent.heart_rate_bpm;
      items.push({
        nombre: "pulso",
        estado:
          reading.pulso === "más bajo"
            ? "mejorando"
            : reading.pulso === "más alto"
              ? "empeorando"
              : "estancado",
        frase: `el pulso medio pasó de ${Math.round(earlyHr.mean)} a ${Math.round(recentHr.mean)}`,
      });
    }
    if (
      reading.esfuerzo === "más bajo" ||
      reading.esfuerzo === "más alto" ||
      reading.esfuerzo === "parecido"
    ) {
      items.push({
        nombre: "esfuerzo",
        estado:
          reading.esfuerzo === "más bajo"
            ? "mejorando"
            : reading.esfuerzo === "más alto"
              ? "empeorando"
              : "estancado",
        frase: `el esfuerzo declarado pasó de ${periods.early.perceived_effort_1_to_10.mean.toFixed(1)} a ${periods.recent.perceived_effort_1_to_10.mean.toFixed(1)}`,
      });
    }
    if (runs.length >= 4) {
      const cut = Math.ceil(runs.length / 2),
        meanKm = (group) =>
          group.reduce((sum, run) => sum + Number(run.distance), 0) /
          group.length,
        before = meanKm(runs.slice(0, cut)),
        after = meanKm(runs.slice(cut)),
        delta = after - before;
      items.push({
        nombre: "distancia de las salidas",
        estado:
          delta > 0.5 ? "mejorando" : delta < -0.5 ? "empeorando" : "estancado",
        frase: `la distancia media pasó de ${before.toFixed(1)} a ${after.toFixed(1)} km`,
      });
    }
    const recentDays = rhythm?.recent_28_days?.run_count,
      previousDays = rhythm?.preceding_28_days?.run_count;
    if (Number.isFinite(recentDays) && Number.isFinite(previousDays)) {
      const delta = recentDays - previousDays;
      items.push({
        nombre: "días con carrera",
        estado:
          delta >= 2 ? "mejorando" : delta <= -2 ? "empeorando" : "estancado",
        frase: `hubo ${recentDays} salidas en los últimos 28 días y ${previousDays} en los 28 anteriores`,
      });
    }
    const take = (estado) =>
      items.filter((item) => item.estado === estado).map((item) => item.frase);
    return {
      juicio: reading.juicio,
      esfuerzo: reading.esfuerzo,
      mejorando: take("mejorando"),
      estancado: take("estancado"),
      empeorando: take("empeorando"),
    };
  }
  const COACH_CLOSERS = [
    "Haz lo que te toca.",
    "Hoy también cuenta.",
    "Sigue con lo tuyo.",
    "Un día más, hecho.",
    "Vuelve a salir.",
  ];
  const QUOTA_DAY_KEY = "ritmo-claro-quota-day";
  const QUOTA_TEXT_KEY = "ritmo-claro-quota-reading";
  const QUOTA_LANGUAGE_KEY = "ritmo-claro-quota-language";
  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }
  function rememberQuotaReading(text) {
    try {
      sessionStorage.setItem(QUOTA_DAY_KEY, todayKey());
      sessionStorage.setItem(QUOTA_TEXT_KEY, text);
      sessionStorage.setItem(QUOTA_LANGUAGE_KEY, isEnglish ? "en" : "es");
    } catch {}
  }
  function savedQuotaReading() {
    try {
      if (sessionStorage.getItem(QUOTA_DAY_KEY) !== todayKey()) return "";
      if (
        sessionStorage.getItem(QUOTA_LANGUAGE_KEY) !== (isEnglish ? "en" : "es")
      )
        return "";
      return sessionStorage.getItem(QUOTA_TEXT_KEY) || "";
    } catch {
      return "";
    }
  }
  function nextReadingTurn() {
    const key = "ritmo-claro-reading-turn";
    try {
      const turn = Number(sessionStorage.getItem(key)) || 0;
      sessionStorage.setItem(key, String((turn + 1) % 15));
      return turn;
    } catch {
      return 0;
    }
  }
  function joinSpanish(parts) {
    if (parts.length <= 1) return parts[0] || "";
    return `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;
  }
  // Used while there is no earlier comparable run: describe only what this run shows, in coach voice.
  function singleRunFallback(run, turn = 0) {
    const goal = goalStore.getGoal(),
      goalPace = goal.durationMinutes / goal.distanceKm,
      sameDistance =
        Math.abs(run.distance_km - goal.distanceKm) <=
        Math.max(0.25, goal.distanceKm * 0.05),
      seconds = Math.round(Math.abs(goalPace - run.pace_min_km) * 60),
      frame = Math.abs(turn) % 3,
      motto = COACH_CLOSERS[Math.abs(turn) % COACH_CLOSERS.length],
      firstLine = `La del ${fmtDate(run.date)} es la única carrera registrada, así que todavía no tienes carreras parecidas con las que compararla.`,
      distanceLine = sameDistance
        ? "Su distancia es la de tu meta, así que su ritmo sí se puede mirar contra el objetivo."
        : "Su distancia no es la de tu meta, así que su ritmo todavía no se compara con ella.",
      paceLine = !sameDistance
        ? ""
        : seconds <= 2
          ? "Quedó muy cerca del ritmo que te propusiste."
          : `Quedó unos ${seconds} segundos por km ${run.pace_min_km > goalPace ? "más lento" : "más rápido"} que el objetivo.`,
      effortLine = Number.isFinite(run.perceived_effort_1_to_10)
        ? ""
        : [
            "En la próxima anota el esfuerzo del 1 al 10: qué tan dura fue, no cómo te sentiste.",
            "Apunta el esfuerzo de la próxima del 1 al 10, pensando en qué tan dura fue.",
            "Anota cuánto te costó la próxima, en una escala del 1 al 10.",
          ][frame],
      pointer =
        "Y, si puedes, sal la próxima vez a una distancia parecida a esta para tener con qué comparar.",
      first = [
        [firstLine, distanceLine, paceLine, effortLine, pointer, motto],
        [firstLine, paceLine, distanceLine, effortLine, motto, pointer],
        [motto, firstLine, distanceLine, paceLine, effortLine, pointer],
      ][frame]
        .filter(Boolean)
        .join(" "),
      second = [
        "Con una sola carrera no hay tendencia que leer.",
        "Cuando tengas otra de distancia parecida, aquí verás si el ritmo, el pulso y el esfuerzo se mueven juntos.",
        "Por ahora esta salida es el punto de partida de tu historial.",
      ].join(" ");
    return [first, second].join("\n\n");
  }
  function singleRunFallbackEnglish(run) {
    const goal = goalStore.getGoal(),
      sameDistance =
        Math.abs(run.distance_km - goal.distanceKm) <=
        Math.max(0.25, goal.distanceKm * 0.05),
      date = new Intl.DateTimeFormat(appLocale, { dateStyle: "medium" }).format(
        new Date(`${run.date}T12:00:00`),
      ),
      first = sameDistance
        ? `There are no similar earlier runs to compare with yet. Your run on ${date} was at the distance you are aiming for, so its pace can be compared with that target, but there is no trend to read.`
        : `There are no similar earlier runs to compare with yet. Your run on ${date} was ${run.distance_km < goal.distanceKm ? "shorter" : "longer"} than the distance you are aiming for, so its pace cannot be compared with that target. There is no trend to read.`,
      watch = Number.isFinite(run.perceived_effort_1_to_10)
        ? "Log another run at a similar distance so you can compare it."
        : "Log how hard the next run felt and add another run at a similar distance to compare.",
      motto = "Do what you need to do.";
    return `${first} ${watch} ${motto}\n\nFor now, this is the starting point of your history. There is not enough comparable history to describe pace, pulse, effort, outing frequency, or distance changes.`;
  }
  function toolFallbackEnglish(calls) {
    const latest = calls.find(
        (call) => call.name === "summarize_latest_run",
      )?.result,
      periods = calls.find(
        (call) => call.name === "compare_pace_periods",
      )?.result;
    if (!latest?.available) return "There is no recorded run to summarize yet.";
    const run = latest.latest;
    if (!periods?.available) return singleRunFallbackEnglish(run);

    const prior = latest.previous_similar_runs,
      paceDelta =
        prior?.sample_count && Number.isFinite(prior.pace_min_km)
          ? (run.pace_min_km - prior.pace_min_km) * 60
          : null,
      paceText =
        paceDelta == null || Math.abs(paceDelta) <= 2
          ? "close to"
          : paceDelta < 0
            ? "faster than"
            : "slower than",
      pulseText =
        Number.isFinite(run.heart_rate_bpm) &&
        Number.isFinite(prior?.heart_rate_bpm)
          ? run.heart_rate_bpm - prior.heart_rate_bpm > 2
            ? "with a higher pulse"
            : prior.heart_rate_bpm - run.heart_rate_bpm > 2
              ? "with a lower pulse"
              : "with a similar pulse"
          : "with no pulse comparison available",
      effortText =
        Number.isFinite(run.perceived_effort_1_to_10) &&
        Number.isFinite(prior?.perceived_effort_1_to_10)
          ? run.perceived_effort_1_to_10 - prior.perceived_effort_1_to_10 > 0.4
            ? "and it felt harder"
            : prior.perceived_effort_1_to_10 - run.perceived_effort_1_to_10 >
                0.4
              ? "and it felt easier"
              : "and it felt similar"
          : "and effort is not available for comparison",
      movements = movementReport(
        periods,
        calls.find((call) => call.name === "summarize_run_rhythm")?.result,
      ),
      paceTrend =
        periods.pace_change_seconds_per_km > 2
          ? "Similar-distance pace has slowed over time."
          : periods.pace_change_seconds_per_km < -2
            ? "Similar-distance pace has become faster over time."
            : "Similar-distance pace has stayed about the same.",
      pulseTrend = movements.mejorando.some((phrase) =>
        phrase.startsWith("el pulso"),
      )
        ? "Pulse has been lower."
        : movements.empeorando.some((phrase) => phrase.startsWith("el pulso"))
          ? "Pulse has been higher."
          : "Pulse has been steady or there is not enough data to compare it.",
      effortTrend = movements.mejorando.some((phrase) =>
        phrase.startsWith("el esfuerzo"),
      )
        ? "Runs have felt easier."
        : movements.empeorando.some((phrase) =>
              phrase.startsWith("el esfuerzo"),
            )
          ? "Runs have felt harder."
          : "Effort has been steady or there is not enough data to compare it.",
      rhythm = calls.find(
        (call) => call.name === "summarize_run_rhythm",
      )?.result,
      outingFrequency =
        Number.isFinite(rhythm?.recent_28_days?.run_count) &&
        Number.isFinite(rhythm?.preceding_28_days?.run_count)
          ? rhythm.recent_28_days.run_count > rhythm.preceding_28_days.run_count
            ? "You have been going out more often lately."
            : rhythm.recent_28_days.run_count <
                rhythm.preceding_28_days.run_count
              ? "You have been going out less often lately."
              : "Your outing frequency has stayed about the same."
          : "There is not enough recent history to compare outing frequency.",
      distanceTrend = movements.mejorando.some((phrase) =>
        phrase.startsWith("la distancia"),
      )
        ? "Run distance has increased."
        : movements.empeorando.some((phrase) =>
              phrase.startsWith("la distancia"),
            )
          ? "Run distance has slipped."
          : "Run distance has stayed about the same or there is not enough data to compare it.";
    const date = new Intl.DateTimeFormat(appLocale, {
      dateStyle: "medium",
    }).format(new Date(`${run.date}T12:00:00`));
    return `Your run on ${date} was ${paceText} earlier runs in a similar distance range, ${pulseText}, ${effortText}. Watch whether the same pattern shows up in another comparable run. Do what you need to do.\n\n${paceTrend} ${pulseTrend} ${effortTrend} ${outingFrequency} ${distanceTrend}`;
  }
  function toolFallback(calls, turn = 0) {
    if (isEnglish) return toolFallbackEnglish(calls);
    const latest = calls.find(
      (call) => call.name === "summarize_latest_run",
    )?.result;
    if (!latest?.available)
      return "No hay una carrera registrada que permita preparar un resumen.";
    const run = latest.latest,
      periods = calls.find(
        (call) => call.name === "compare_pace_periods",
      )?.result;
    if (!periods?.available) return singleRunFallback(run, turn);
    const reading = statisticianReading(periods),
      movements = movementReport(
        periods,
        calls.find((call) => call.name === "summarize_run_rhythm")?.result,
      ),
      seconds = Number.isFinite(periods?.pace_change_seconds_per_km)
        ? Math.round(Math.abs(periods.pace_change_seconds_per_km))
        : 0,
      paceWords = seconds > 2 ? `unos ${seconds} segundos más` : "un poco más",
      lighter =
        reading.ritmo === "más rápido" &&
        reading.pulso !== "más alto" &&
        reading.esfuerzo !== "más alto" &&
        (reading.pulso === "más bajo" || reading.esfuerzo === "más bajo"),
      eased = [
        reading.pulso === "más bajo" ? "el pulso" : "",
        reading.esfuerzo === "más bajo" ? "el esfuerzo" : "",
      ].filter(Boolean),
      harder = [
        reading.pulso === "más alto" ? "el pulso" : "",
        reading.esfuerzo === "más alto" ? "el esfuerzo" : "",
      ].filter(Boolean);
    let picture = "En las carreras parecidas vas parecido a como venías.";
    if (lighter)
      picture = `En las carreras parecidas vas más suelto. ${paceWords[0].toUpperCase()}${paceWords.slice(1)} rápido por kilómetro${
        eased.length
          ? `, y ${joinSpanish(eased)} ${eased.length > 1 ? "bajaron" : "bajó"} con eso`
          : ""
      }.`;
    else if (reading.ritmo === "más rápido" && harder.length)
      picture = `Vas más rápido en las carreras parecidas, ${paceWords} por kilómetro, y ${joinSpanish(harder)} también ${harder.length > 1 ? "subieron" : "subió"}.`;
    else if (reading.ritmo === "más lento")
      picture = `En las carreras parecidas el ritmo se te fue para atrás, ${paceWords} lento por kilómetro${
        harder.length ? `, con ${joinSpanish(harder)} más alto` : ""
      }.`;
    else if (reading.ritmo === "más rápido")
      picture = `En las carreras parecidas vas ${paceWords} rápido por kilómetro.`;
    if (movements.mejorando.some((phrase) => phrase.startsWith("hubo ")))
      picture += " También estás saliendo más seguido.";
    else if (movements.empeorando.some((phrase) => phrase.startsWith("hubo ")))
      picture += " Estás saliendo menos seguido.";
    const distanceFlat = movements.estancado.some((phrase) =>
        phrase.includes("distancia"),
      ),
      distanceUp = movements.mejorando.some((phrase) =>
        phrase.includes("distancia"),
      ),
      distanceDown = movements.empeorando.some((phrase) =>
        phrase.includes("distancia"),
      ),
      prior = latest.previous_similar_runs,
      paceDelta =
        prior?.sample_count && Number.isFinite(prior.pace_min_km)
          ? (run.pace_min_km - prior.pace_min_km) * 60
          : null,
      pulseDown =
        Number.isFinite(run.heart_rate_bpm) &&
        Number.isFinite(prior?.heart_rate_bpm) &&
        prior.heart_rate_bpm - run.heart_rate_bpm > 2,
      pulseUp =
        Number.isFinite(run.heart_rate_bpm) &&
        Number.isFinite(prior?.heart_rate_bpm) &&
        run.heart_rate_bpm - prior.heart_rate_bpm > 2,
      effortDown =
        Number.isFinite(run.perceived_effort_1_to_10) &&
        Number.isFinite(prior?.perceived_effort_1_to_10) &&
        prior.perceived_effort_1_to_10 - run.perceived_effort_1_to_10 > 0.4,
      effortUp =
        Number.isFinite(run.perceived_effort_1_to_10) &&
        Number.isFinite(prior?.perceived_effort_1_to_10) &&
        run.perceived_effort_1_to_10 - prior.perceived_effort_1_to_10 > 0.4,
      latestBits = [
        paceDelta === null || Math.abs(paceDelta) <= 2
          ? ""
          : paceDelta < -2
            ? "más rápida que las parecidas de antes"
            : "más lenta que las parecidas de antes",
        pulseDown ? "con el pulso más bajo" : "",
        pulseUp ? "con el pulso más alto" : "",
        effortDown ? "con menos esfuerzo" : "",
        effortUp ? "con más esfuerzo" : "",
      ].filter(Boolean),
      latestFeel =
        paceDelta === null
          ? ""
          : paceDelta < -2 && !pulseUp && !effortUp
            ? "te salió ligera"
            : paceDelta < -2 && (pulseUp || effortUp)
              ? "fue rápida, y también te costó más"
              : paceDelta > 2
                ? "te costó más que las parecidas"
                : "salió parecida a las de antes",
      latestLine = `La del ${fmtDate(run.date)}${latestFeel ? ` ${latestFeel}` : ""}.${
        latestBits.length ? ` Fue ${joinSpanish(latestBits)}.` : ""
      }${
        distanceFlat
          ? " En kilómetros se quedó en el mismo tramo de las otras."
          : distanceDown
            ? " En kilómetros se quedó más corta."
            : distanceUp
              ? " En kilómetros sí se alargó."
              : ""
      }`,
      watch = (
        distanceFlat || distanceDown
          ? [
              "La próxima, fíjate en la distancia.",
              "Lo que toca mirar es la distancia.",
              "Quédate pendiente de la distancia.",
            ]
          : reading.ritmo === "más lento" || harder.length
            ? [
                "La próxima, mira si eso se repite.",
                "Fíjate si la siguiente sale igual.",
                "La que sigue te dice si esto se queda.",
              ]
            : reading.esfuerzo === "sin dato"
              ? [
                  "La próxima, anota el esfuerzo del 1 al 10.",
                  "En la siguiente, apunta el esfuerzo.",
                  "Anota cómo te costó la próxima.",
                ]
              : ["", "", ""]
      )[Math.abs(turn) % 3],
      fits =
        (paceDelta < -2 && reading.ritmo === "más rápido") ||
        (paceDelta > 2 && reading.ritmo === "más lento") ||
        (paceDelta !== null &&
          Math.abs(paceDelta) <= 2 &&
          reading.ritmo === "parecido");
    const frame = Math.abs(turn) % 3,
      lead = (
        fits
          ? [
              "Y encaja con lo que ya venías haciendo.",
              "No es cosa de una sola salida.",
              "El historial va por el mismo lado.",
            ]
          : [
              "El resto del historial va por otro lado.",
              "Esa salida no repite lo de las demás.",
              "El historial cuenta otra cosa.",
            ]
      )[frame],
      motto = COACH_CLOSERS[Math.abs(turn) % COACH_CLOSERS.length],
      session = [
        [latestLine, watch, motto],
        [latestLine, motto, watch],
        [motto, latestLine, watch],
      ][frame].filter(Boolean);
    picture = `${lead} ${picture}`;
    return [session.join(" "), picture].join("\n\n");
  }
  function parseModelReading(text) {
    const raw = String(text)
      .replace(/<\|[^>]+\|>/g, "")
      .trim();
    const obj = extractObject(raw);
    let chart =
      obj?.chart_id ||
      raw.match(
        /(?:CHART|GRAFICA)\s*[:=]\s*(pace|speed|distances|days|heart|effort)/i,
      )?.[1];
    let summary =
      typeof obj?.summary === "string"
        ? obj.summary
        : raw.match(/(?:SUMMARY|RESUMEN)\s*[:=]\s*([\s\S]*)/i)?.[1];
    if (!summary && !obj)
      summary = raw
        .replace(
          /(?:CHART|GRAFICA)\s*[:=]\s*(pace|speed|distances|days|heart|effort)/gi,
          "",
        )
        .trim();
    summary = String(summary || "")
      .replace(/^(?:SUMMARY|RESUMEN)\s*[:=]\s*/i, "")
      .trim()
      .slice(0, 2800);
    chart = chart?.toLowerCase();
    if (chart === "speed") chart = "pace";
    return { chart, summary };
  }
  function cacheKey(id, all) {
    return `${CONFIG.modelId}|${appLocale}|${id}|${JSON.stringify(goalStore.getGoal())}|${JSON.stringify(all.map((r) => [r.date, r.distance, r.duration, r.hr, r.feel, r.cadence, r.rpe, r.elevationGain, r.caloriesKcal, r.note]))}`;
  }
  // One saved model reading per account (Drive file or guest), so the runner does not pay for a new call on every visit.
  function readingStorageKey() {
    const session = readSession();
    return `${CONFIG.storagePrefix}${session?.fileId ? `drive:${session.fileId}` : "guest"}`;
  }
  function saveStoredReading(key, text) {
    try {
      localStorage.setItem(
        readingStorageKey(),
        JSON.stringify({ key, version: CONFIG.promptVersion, text }),
      );
    } catch {}
  }
  function restoreStoredReading() {
    try {
      const saved = JSON.parse(
          localStorage.getItem(readingStorageKey()) || "null",
        ),
        key = cacheKey("all", chartRuns());
      if (
        saved?.version !== CONFIG.promptVersion ||
        saved?.key !== key ||
        !usefulNarrative(saved?.text)
      )
        return;
      resultCache.set(key, saved.text);
      resultSources.set(key, "model");
      setReading(saved.text);
    } catch {}
  }
  function usefulNarrative(text) {
    const value = String(text || "")
      .replace(/<\|[^>]+\|>/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/^\s{0,3}#{1,6}\s*/gm, "")
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .trim();
    const words = value.split(/\s+/).filter(Boolean),
      letters = (value.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length,
      lines = value.split(/\n/).filter(Boolean),
      paragraphs = value
        .split(/\n\s*\n/)
        .filter((paragraph) => paragraph.trim());
    if (
      !/[.!?…][”’"')\]]*$/.test(value) ||
      value.length < 30 ||
      value.length > 2800 ||
      words.length < 6 ||
      words.length > 480 ||
      letters < 24 ||
      /[{}]/.test(value) ||
      /\|[-: ]+\|/.test(value) ||
      lines.length > 20 ||
      paragraphs.length > 5 ||
      /^\s*(?:CHART|GRAFICA|SUMMARY|RESUMEN|ANALYSIS|ANÁLISIS)\s*[:=]/i.test(
        value,
      )
    )
      return "";
    // Reject unsupported physiological explanations even when the prose is fluent.
    if (
      /\b(?:eficiencia cardiovascular|adaptaci[oó]n cardiovascular|mejora fisiol[oó]gica|el cuerpo (?:exige|necesita)|mejora(?:s)? de la capacidad cardiovascular|cardiovascular efficiency|cardiovascular adaptation|physiological improvement|your body (?:demands|needs)|improved cardiovascular capacity)\b/i.test(
        value,
      )
    )
      return "";
    if (
      /\b(?:esfuerzo percibido|esfuerzo se (?:percibe|sinti[oó]) (?:m[aá]s )?(?:f[aá]cil|c[oó]modo)|margen subjetivo|manejas? ritmos? m[aá]s altos|perceived effort|subjective margin|handling faster paces)\b/i.test(
        value,
      )
    )
      return "";
    if (
      (value.match(/\d+/g) || []).length > 4 ||
      /[«»]|\bAnotaste\b/i.test(value)
    )
      return "";
    return value;
  }
  function resultOf(calls, name) {
    return calls.find((call) => call.name === name)?.result ?? null;
  }
  function modelEvidenceBrief(id, calls, turn = 0) {
    const goal = goalStore.getGoal(),
      latest = resultOf(calls, "summarize_latest_run"),
      notes = resultOf(calls, "read_run_notes"),
      periods = resultOf(calls, "compare_pace_periods"),
      exposure = resultOf(calls, "summarize_goal_distance_exposure"),
      rhythm = resultOf(calls, "summarize_run_rhythm"),
      run = latest?.latest,
      sameDistance =
        run &&
        Math.abs(run.distance_km - goal.distanceKm) <=
          Math.max(0.25, goal.distanceKm * 0.05);
    const comparable = Boolean(periods?.available);
    const languageInstruction = isEnglish
      ? `Respond entirely in English. Start with CHART: pace, distances, days, heart, or effort. The initial chart is ${id}. Speak to the runner in two short paragraphs, like a coach after a run. Make the latest run stand out in the first paragraph. End it with the exact “closing” line included in the data. Put the run in historical context in the second paragraph. Use at most one number. Do not quote notes, repeat the goal, list figures, or use slogans. ${comparable ? "" : "There are no similar runs to compare yet: do not claim a trend or say this run was similar, faster, or slower. Describe only what this run shows and what to record for comparison next time."}`
      : `Empieza con CHART: pace, distances, days, heart o effort. Si hablaras de km/h, usa pace. La vista inicial es ${id}. Habla de tú, en dos párrafos cortos, como un coach después de una salida. El primero es el feedback de la última carrera y tiene que notarse. Cierra con la frase de «cierre», tal cual. El segundo la mete en el historial. Como mucho un número. No cites las notas, no recites la meta y no sueltes filas de cifras. No uses consignas. ${comparable ? "" : "Todavía no hay carreras parecidas con las que comparar: no hables de tendencia, ni de «lo de siempre», ni de que vas parecido. Di qué muestra esta salida y qué registrar para poder comparar la próxima."}`;
    return `${languageInstruction}\n${JSON.stringify({
      juicio: statisticianReading(periods),
      movimientos: movementReport(periods, rhythm),
      sin_comparacion: !comparable,
      no_comparison: !comparable,
      meta: {
        distancia_km: goal.distanceKm,
        duracion_minutos: goal.durationMinutes,
        fecha: goal.date,
        la_ultima_carrera_es_de_la_misma_distancia: Boolean(sameDistance),
        ritmo_meta_min_km:
          sameDistance && goal.distanceKm > 0
            ? goal.durationMinutes / goal.distanceKm
            : null,
      },
      historial: {
        carreras: exposure?.runs_count ?? null,
        mas_larga_km: exposure?.longest_run_km ?? null,
        mas_larga_fecha: exposure?.longest_run_date ?? null,
        porcentaje_de_la_meta: exposure?.longest_as_percent_of_goal ?? null,
        carreras_cerca_de_la_meta:
          exposure?.runs_at_least_80_percent_of_goal ?? null,
        ultimos_28_dias: rhythm?.recent_28_days ?? null,
        dias_desde_la_anterior:
          rhythm?.days_since_previous_recorded_run ?? null,
      },
      ultima_carrera: run
        ? {
            fecha: run.date,
            distancia_km: run.distance_km,
            ritmo_min_km: run.pace_min_km,
            pulso: run.heart_rate_bpm,
            esfuerzo: run.perceived_effort_1_to_10,
            nota: run.note,
          }
        : null,
      mitades: periods,
      cierre: isEnglish
        ? "Do what you need to do."
        : COACH_CLOSERS[Math.abs(turn) % COACH_CLOSERS.length],
      closing: isEnglish ? "Do what you need to do." : undefined,
      notas_anteriores: (notes?.notes || []).map((note) => ({
        fecha: note.date,
        ritmo_min_km: note.pace_min_km,
        pulso: note.heart_rate_bpm,
        esfuerzo: note.perceived_effort_1_to_10,
        nota: note.note,
      })),
    })}`;
  }
  async function explainCurrentGraph(all, id) {
    const key = cacheKey("all", all);
    const toolCalls = runAnalysisTools(all, id);
    if (resultCache.has(key)) {
      setReading(resultCache.get(key));
      return;
    }
    if (inFlightKeys.has(key)) return;
    const turn = nextReadingTurn();
    inFlightKeys.add(key);
    analyzing = true;
    updateControls();
    const sequence = ++inferenceSeq;
    ui.status.textContent = "Analizando tus datos…";
    showChartThinking(
      "Preparando la lectura",
      "Relacionando tu última carrera con el historial.",
    );
    const context = modelEvidenceBrief(id, toolCalls, turn);
    let selectedChart = id;
    let modelSelectedChart = false;
    try {
      const text = await providers.cloud.interpret([
        { role: "user", content: context },
      ]);
      const reading = parseModelReading(text);
      selectedChart = graphCharts.some((spec) => spec.id === reading.chart)
        ? reading.chart
        : id;
      modelSelectedChart = graphCharts.some(
        (spec) => spec.id === reading.chart,
      );
      const summary = usefulNarrative(reading.summary);
      if (!summary)
        throw new Error("El modelo no devolvió una explicación utilizable");
      resultCache.set(key, summary);
      resultSources.set(key, "model");
      saveStoredReading(key, summary);
      if (sequence === inferenceSeq) {
        if (modelSelectedChart) {
          aiSuggestedChart = selectedChart;
          aiSuggestedAnalysisKey = key;
        }
        setActiveChart(selectedChart);
        renderCurrentCarousel(all);
        ui.status.textContent =
          "Listo. La lectura se queda aquí mientras miras las gráficas.";
      }
    } catch (error) {
      const fallback = toolFallback(toolCalls, turn);
      resultCache.set(key, fallback);
      resultSources.set(key, "calculated");
      if (/cuota diaria/i.test(error.message)) rememberQuotaReading(fallback);
      if (sequence === inferenceSeq) {
        if (modelSelectedChart) {
          aiSuggestedChart = selectedChart;
          aiSuggestedAnalysisKey = key;
        }
        setActiveChart(selectedChart);
        renderCurrentCarousel(all);
        ui.status.textContent = /cuota diaria/i.test(error.message)
          ? "La cuota de hoy se agotó. No hay lectura nueva: el texto es el cálculo de tus datos y se queda igual."
          : error.message === "El modelo no devolvió una explicación utilizable"
            ? "El servicio respondió, pero su texto no pasó la validación. Se muestra la lectura calculada con tus datos."
            : "El servicio no completó la consulta. Se muestra la lectura calculada con tus datos.";
      }
    } finally {
      inFlightKeys.delete(key);
      analyzing = false;
      updateControls();
    }
  }
  const baseRender = getRenderCarousel();
  setRenderCarousel((all) => {
    baseRender(all);
    const key = cacheKey("all", all),
      cachedText = resultCache.get(key);
    if (cachedText) setReading(cachedText);
    else if (!analyzing) setReading("");
    updateControls();
  });
  // The cache key already includes the goal and every run field, so changed data misses on its own. Re-render only.
  window.addEventListener("ritmo-goal-updated", () => {
    aiSuggestedAnalysisKey = null;
    renderCurrentCarousel(chartRuns());
  });
  ui.button.onclick = async () => {
    if (analyzing || hasModelReading()) return;
    const saved = savedQuotaReading();
    if (saved) {
      const key = cacheKey("all", chartRuns());
      resultCache.set(key, saved);
      resultSources.set(key, "calculated");
      setReading(saved);
      updateControls();
      ui.status.textContent =
        "La cuota de hoy sigue agotada. No hay lectura nueva: este texto es el cálculo y no cambia.";
      return;
    }
    const all = chartRuns(),
      key = cacheKey("all", all);
    resultCache.delete(key);
    resultSources.delete(key);
    await explainCurrentGraph(all, getActiveChart());
  };
  async function checkProvider() {
    try {
      const response = await fetch("/api/health", { cache: "no-store" }),
        isJson = response.headers
          .get("content-type")
          ?.includes("application/json"),
        payload = isJson ? await response.json() : {};
      if (!response.ok || !payload.ok) throw new Error("Worker no disponible");
      ui.status.textContent = "Servicio disponible · sujeto a cuota";
    } catch {
      ui.status.textContent =
        "Servicio sin conexión · se mostrará una lectura de respaldo";
    }
  }
  restoreStoredReading();
  void checkProvider();
  updateControls();
})();
