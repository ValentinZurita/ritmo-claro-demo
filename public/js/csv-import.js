// File map: CSV mapping, preview, and batch import flow.

import { isCloudAccount } from "./data/account.js";
import { runStore } from "./data/run-store.js";
import { draw, sorted } from "./demo-data.js";

export let openCsvImporter = () => {};

(() => {
  const $ = (id) => document.getElementById(id),
    modal = $("csvModal"),
    fileInput = $("csvFile");
  let parsedRows = [],
    headers = [],
    prepared = [];
  const fields = [
    ["date", "Fecha *", true, ["fecha", "date", "start date", "activity date"]],
    [
      "distance",
      "Distancia *",
      true,
      [
        "distancia",
        "distance",
        "distance km",
        "kilometers",
        "kilometres",
        "km",
        "miles",
      ],
    ],
    [
      "duration",
      "Duración *",
      true,
      ["duracion", "duration", "moving time", "elapsed time", "time"],
    ],
    [
      "hr",
      "Pulso medio",
      false,
      [
        "pulso medio",
        "frecuencia cardiaca media",
        "average heart rate",
        "avg hr",
        "heart rate",
        "hr",
      ],
    ],
    [
      "feel",
      "Sensación 1–10",
      false,
      ["sensacion", "feeling", "feel", "rating"],
    ],
    [
      "cadence",
      "Cadencia",
      false,
      ["cadencia", "cadence", "steps per minute", "spm"],
    ],
    [
      "rpe",
      "Esfuerzo percibido 1–10",
      false,
      ["esfuerzo percibido", "rpe", "session rpe"],
    ],
    [
      "elevationGain",
      "Desnivel positivo",
      false,
      [
        "desnivel positivo",
        "elevation gain",
        "total ascent",
        "ascent",
        "elevation gain m",
      ],
    ],
    [
      "caloriesKcal",
      "Calorías estimadas (kcal)",
      false,
      [
        "calories",
        "calories kcal",
        "calorie",
        "kcal",
        "active calories",
        "energy",
      ],
    ],
    ["note", "Nota", false, ["nota", "notas", "note", "notes", "comment"]],
  ];
  const norm = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function parseCsv(text) {
    text = text.replace(/^\uFEFF/, "");
    const first = text.split(/\r?\n/, 1)[0] || "";
    let delimiter = ",",
      best = -1;
    for (const d of [",", ";", "\t"]) {
      let n = 0,
        quoted = false;
      for (let i = 0; i < first.length; i++) {
        if (first[i] === '"') {
          if (quoted && first[i + 1] === '"') {
            i++;
            continue;
          }
          quoted = !quoted;
        } else if (first[i] === d && !quoted) n++;
      }
      if (n > best) {
        best = n;
        delimiter = d;
      }
    }
    const rows = [];
    let row = [],
      cell = "",
      quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === delimiter && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((ch === "\n" || ch === "\r") && !quoted) {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        if (row.some((v) => String(v).trim() !== "")) rows.push(row);
        row = [];
        cell = "";
      } else cell += ch;
    }
    row.push(cell);
    if (row.some((v) => String(v).trim() !== "")) rows.push(row);
    return rows;
  }
  function guess(field) {
    const aliases = fields.find((f) => f[0] === field)[3];
    return headers.findIndex(
      (h) =>
        aliases.includes(norm(h)) ||
        aliases.some((a) => a.length > 4 && norm(h).includes(a)),
    );
  }
  function buildMapping() {
    const host = $("csvMapping");
    host.innerHTML = fields
      .map(
        ([key, label, required]) =>
          `<div class="field"><label for="map_${key}">${label}</label><select id="map_${key}" data-key="${key}" ${required ? "required" : ""}>${required ? '<option value="">Selecciona columna</option>' : '<option value="">No importar</option>'}${headers.map((h, i) => `<option value="${i}" ${i === guess(key) ? "selected" : ""}>${esc(h || `Columna ${i + 1}`)}</option>`).join("")}</select></div>`,
      )
      .join("");
    host
      .querySelectorAll("select")
      .forEach((x) => x.addEventListener("change", preview));
  }
  function parseDate(value) {
    const s = String(value ?? "").trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
      const d = new Date(s);
      if (!Number.isNaN(+d)) return d.toISOString().slice(0, 10);
    }
    let m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
    if (m) {
      const d = new Date(+m[3], +m[2] - 1, +m[1]);
      if (
        d.getFullYear() === +m[3] &&
        d.getMonth() === +m[2] - 1 &&
        d.getDate() === +m[1]
      )
        return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    const d = new Date(s);
    return Number.isNaN(+d) ? null : d.toISOString().slice(0, 10);
  }
  function num(value) {
    let s = String(value ?? "")
      .trim()
      .replace(/\s/g, "");
    if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
    else s = s.replace(/,/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function duration(value) {
    const s = String(value ?? "").trim();
    if (s.includes(":")) {
      const p = s.split(":").map(Number);
      if (p.some((n) => !Number.isFinite(n))) return null;
      if (p.length === 2) return p[0] + p[1] / 60;
      if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
      return null;
    }
    const n = num(s);
    if (n === null) return null;
    return $("csvDurationUnit").value === "seconds" ? n / 60 : n;
  }
  function rowValue(row, key) {
    const sel = $(`map_${key}`);
    return sel && sel.value !== ""
      ? (row[Number(sel.value)]?.trim() ?? "")
      : "";
  }
  function currentRuns() {
    try {
      return sorted();
    } catch {
      return [];
    }
  }
  function key(r) {
    return `${r.date}|${(Math.round(r.distance * 100) / 100).toFixed(2)}|${Math.round(r.duration * 60)}`;
  }
  function preview() {
    const mapOk = ["date", "distance", "duration"].every(
      (k) => $(`map_${k}`)?.value !== "",
    );
    prepared = [];
    let invalid = 0,
      dupes = 0;
    const existing = new Set(currentRuns().map(key));
    if (mapOk) {
      for (const row of parsedRows) {
        const date = parseDate(rowValue(row, "date")),
          rawDist = num(rowValue(row, "distance")),
          dur = duration(rowValue(row, "duration"));
        if (
          !date ||
          rawDist === null ||
          dur === null ||
          rawDist <= 0 ||
          dur <= 0
        ) {
          invalid++;
          continue;
        }
        const dist =
          $("csvDistanceUnit").value === "mi" ? rawDist * 1.60934 : rawDist;
        const run = {
          date,
          distance: dist,
          duration: dur,
          hr: num(rowValue(row, "hr")),
          feel: num(rowValue(row, "feel")),
          cadence: num(rowValue(row, "cadence")),
          rpe: num(rowValue(row, "rpe")),
          elevationGain: num(rowValue(row, "elevationGain")),
          caloriesKcal: num(rowValue(row, "caloriesKcal")),
          note: rowValue(row, "note"),
        };
        if (run.elevationGain !== null && $("csvElevationUnit").value === "ft")
          run.elevationGain *= 0.3048;
        if (run.hr !== null && (run.hr < 30 || run.hr > 240)) run.hr = null;
        if (run.feel !== null && (run.feel < 1 || run.feel > 10))
          run.feel = null;
        if (run.cadence !== null && (run.cadence < 1 || run.cadence > 300))
          run.cadence = null;
        if (run.rpe !== null && (run.rpe < 1 || run.rpe > 10)) run.rpe = null;
        if (run.elevationGain !== null && run.elevationGain < 0)
          run.elevationGain = null;
        if (run.caloriesKcal !== null && run.caloriesKcal < 0)
          run.caloriesKcal = null;
        const k = key(run);
        if (existing.has(k)) {
          dupes++;
          continue;
        }
        existing.add(k);
        prepared.push(run);
      }
    } else invalid = parsedRows.length;
    $("csvSummary").textContent = mapOk
      ? `${prepared.length} listas para importar · ${invalid} con datos faltantes o inválidos · ${dupes} duplicadas omitidas.`
      : "Asigna las columnas obligatorias de fecha, distancia y duración para ver la vista previa.";
    $("confirmCsv").disabled = prepared.length === 0;
    $("confirmCsv").textContent =
      `Importar ${prepared.length} ${prepared.length === 1 ? "carrera" : "carreras"}`;
    const show = prepared.slice(0, 5);
    $("csvPreview").innerHTML = show.length
      ? `<table><thead><tr><th>Fecha</th><th>Distancia</th><th>Duración</th><th>Pulso</th><th>Sensación</th><th>Esfuerzo</th><th>Desnivel</th><th>kcal app</th></tr></thead><tbody>${show.map((r) => `<tr><td>${esc(r.date)}</td><td>${r.distance.toFixed(2)} km</td><td>${r.duration.toFixed(1)} min</td><td>${r.hr ?? "—"}</td><td>${r.feel ?? "—"}</td><td>${r.rpe ?? "—"}</td><td>${r.elevationGain === null ? "—" : `${Math.round(r.elevationGain)} m`}</td><td>${r.caloriesKcal ?? "—"}</td></tr>`).join("")}</tbody></table>${prepared.length > 5 ? `<div class="footnote compact">Vista previa de 5 de ${prepared.length} carreras.</div>` : ""}`
      : "";
  }
  function closeCsv({ imported = false } = {}) {
    modal.classList.remove("open");
    if (!imported) window.dispatchEvent(new Event("ritmo-csv-closed"));
  }
  function openCsvModal() {
    modal.classList.add("open");
    fileInput.value = "";
    $("csvFileName").textContent = "Ningún archivo seleccionado";
    $("csvControls").hidden = true;
    $("confirmCsv").disabled = true;
    prepared = [];
  }
  openCsvImporter = openCsvModal;
  $("importCsvBtn").onclick = openCsvModal;
  $("closeCsv").onclick = $("cancelCsv").onclick = () => closeCsv();
  modal.onclick = (e) => {
    if (e.target === modal) closeCsv();
  };
  $("csvDistanceUnit").onchange = preview;
  $("csvDurationUnit").onchange = preview;
  $("csvElevationUnit").onchange = preview;
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    $("csvFileName").textContent = file.name;
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2)
        throw new Error("El archivo no tiene encabezados y filas de datos.");
      headers = rows[0].map((x) => String(x).trim());
      parsedRows = rows
        .slice(1)
        .filter((r) => r.some((v) => String(v).trim()))
        .map((r) => headers.map((_, i) => r[i] ?? ""));
      buildMapping();
      $("csvControls").hidden = false;
      preview();
    } catch (e) {
      $("csvControls").hidden = false;
      $("csvSummary").textContent = e.message || "No se pudo leer el CSV.";
      $("csvPreview").innerHTML = "";
      $("confirmCsv").disabled = true;
    }
  };
  $("confirmCsv").onclick = () => {
    if (!prepared.length) return;
    const count = prepared.length;
    runStore.addRuns(prepared);
    draw();
    closeCsv({ imported: true });
    $("toast").textContent = isCloudAccount()
      ? `${count} ${count === 1 ? "carrera guardada en tu Drive" : "carreras guardadas en tu Drive"}`
      : `${count} ${count === 1 ? "carrera importada" : "carreras importadas"}`;
    $("toast").classList.add("show");
    setTimeout(() => {
      $("toast").classList.remove("show");
      $("toast").textContent = isCloudAccount()
        ? "Carrera guardada en tu Drive"
        : "Carrera guardada en este dispositivo";
    }, 2400);
    window.dispatchEvent(new Event("ritmo-csv-imported"));
  };
  $("downloadCsvTemplate").onclick = () => {
    const csv =
      'fecha,distancia_km,duracion_min,pulso_medio_lpm,sensacion_1_10,cadencia_pasos_min,esfuerzo_percibido_1_10,desnivel_positivo_m,calorias_kcal,nota\n2026-10-10,5,38.5,150,7,168,6,80,320,"Ritmo cómodo"\n';
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-ritmo-claro.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
})();
