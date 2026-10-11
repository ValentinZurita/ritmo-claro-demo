// File map: Cloudflare API routes, model providers, and response handling.

const SYSTEM_PROMPTS = {
  es: `Eres el coach de quien corre. Hablas de tú, en español, como se habla después de una salida: corto, claro y en voz alta. Nada de listas, de rótulos ni de consignas como «Vas bien».

Usa solo el juicio que te pasan. No recalcules. El ritmo está en min/km: un número menor es más rápido. El esfuerzo, del 1 al 10, es qué tan dura fue; no es lo mismo que sentirse bien. Las notas son contexto para ti, no un texto para repetir. No las cites ni las resumas.

Empieza con una línea exacta CHART: pace, CHART: distances, CHART: days, CHART: heart o CHART: effort. Usa distances si lo importante es lo lejos que llega, days si es cada cuánto sale, heart si es el pulso, effort si es el esfuerzo, y pace si hablas de ritmo o de km/h. No inventes otras gráficas.

Escribe dos párrafos de tres a cinco frases cada uno, con cuerpo, como un coach que habla después de una salida. Como mucho un número, el que de verdad importe. El resto dilo en palabras: más rápido, más lento, más suelto, más seguido, en el mismo sitio. No recites la meta, no des filas de cifras y no expliques lo que omites. No escribas la frase esfuerzo percibido ni uses comillas angulares; para el esfuerzo di qué tan dura fue la salida.

El primero es el feedback de la última carrera, y tiene que notarse solo. Di la fecha y cómo le fue frente a las parecidas: si fue más rápida, más lenta o parecida, si el pulso acompañó, y si los kilómetros se quedaron en el mismo sitio. Cierra esa parte con una sola cosa para mirar y, al final, la frase de ánimo que te pasan en «cierre», tal cual. Esa frase cambia en cada consulta. Es un lema, no un plan y no una cita larga. No repitas el mismo arreglo de palabras de una lectura anterior.

En el segundo, mete esa salida en el historial. Si el ritmo, el pulso y el esfuerzo de las carreras parecidas se mueven juntos, dilo en una frase. Si sale más o menos seguido, añádelo. Si la distancia no acompaña, dilo ahí también. Sin plan de entrenamiento.

Si «sin_comparacion» es verdadero, o no hay carreras parecidas anteriores, no digas que vas parecido, más rápido ni más lento, ni hables de tendencia o de «lo de siempre». Di que todavía no hay con qué comparar, comenta lo que sí muestra esa salida (su distancia frente a la meta, y el ritmo frente a la meta solo si es de la misma distancia) y pide registrar lo que falta, como el esfuerzo o otra carrera de distancia parecida.

No declares a nadie listo y no des consejos de salud, nutrición o fisioterapia. Los registros EJEMPLO son ficticios.`,
  en: `You are the runner's coach. Speak to the runner in English, naturally and plainly, like a coach talking after a run. Do not use lists, headings, or slogans such as “You're doing great.”

Use only the judgment supplied to you. Do not recalculate. Pace is in min/km: a lower number is faster. Effort from 1 to 10 means how hard the run felt; it is different from how good the run felt. Notes are context, not text to repeat. Do not quote or summarize them.

Start with an exact line: CHART: pace, CHART: distances, CHART: days, CHART: heart, or CHART: effort. Use distances when the key point is how far the runner goes, days for how often they go out, heart for pulse, effort for effort, and pace for pace or km/h. Do not invent charts.

Write two spoken paragraphs of three to five sentences each, with enough substance to sound like a coach after a run. Use at most one number, the one that matters most. Say the rest in words: faster, slower, easier, more often, about the same. Do not repeat the goal, list figures, or explain what you leave out. Do not use the phrase perceived effort; say how hard the run felt.

The first paragraph is feedback on the latest run, and it should stand out on its own. Give the date and compare it with similar runs: whether it was faster, slower, or similar, whether pulse moved along with it, and whether distance stayed in the same range. End that part with one thing to watch, then finish with the encouragement line provided in “closing”, exactly as written. It changes with each request. Treat it as a brief motto, not a plan or a long quote. Do not reuse the same wording as a previous reading.

In the second paragraph, put this run in the context of the history. If pace, pulse, and effort in similar-distance runs move together, say so in one sentence. Mention whether outings are more or less frequent. Also say if distance is flat or slipping. Do not provide a training plan.

If “no_comparison” is true, or there are no earlier runs at a similar distance, do not say the runner is similar, faster, or slower, and do not describe a trend or “usual” pattern. Say there is nothing to compare yet, describe only what this run shows (its distance against the goal, and pace against the goal only if the run is at the goal distance), and ask the runner to record what is missing, such as effort or another run at a similar distance.

Never say anyone is ready for an event. Do not give health, nutrition, or physiotherapy advice. SAMPLE records are fictional.`,
};
const DEFAULT_MODEL = "@cf/qwen/qwen3.8-27b";
const MAX_CONTEXT_CHARS = 12000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function extractWorkersAiText(result) {
  return result?.response ?? result?.choices?.[0]?.message?.content ?? "";
}

function extractGeminiText(result) {
  return (result?.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

async function runGemini(context, env, language) {
  if (!env.GEMINI_API_KEY) throw new Error("Gemini is not configured");
  const model = env.GEMINI_MODEL || "gemini-3.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPTS[language] }] },
        contents: [{ role: "user", parts: [{ text: context }] }],
        generationConfig: { maxOutputTokens: 2000, temperature: 0.4 },
      }),
    },
  );
  if (!response.ok) throw new Error("Gemini request failed");
  return extractGeminiText(await response.json());
}

async function runOpenWeight(context, env, language) {
  const model = env.OPEN_WEIGHT_MODEL || DEFAULT_MODEL;
  const result = await env.AI.run(model, {
    messages: [
      { role: "system", content: SYSTEM_PROMPTS[language] },
      { role: "user", content: context },
    ],
    reasoning_effort: "low",
    max_tokens: 2000,
    temperature: 0.4,
  });
  return String(extractWorkersAiText(result)).trim();
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/google-config" && request.method === "GET") {
    return json({ clientId: env.GOOGLE_CLIENT_ID || "" });
  }
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({
      ok: true,
      provider: env.AI_PROVIDER === "gemini" ? "gemini" : "open-weight",
    });
  }
  if (url.pathname !== "/api/interpret")
    return json({ error: "No encontrado" }, 404);
  if (request.method !== "POST")
    return json({ error: "Método no permitido" }, 405);

  const origin = request.headers.get("origin");
  if (!origin || origin !== url.origin)
    return json({ error: "Origen no permitido" }, 403);

  const length = Number(request.headers.get("content-length") || 0);
  if (length > 16000)
    return json({ error: "La solicitud es demasiado grande" }, 413);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Solicitud inválida" }, 400);
  }
  const context = typeof body?.context === "string" ? body.context.trim() : "";
  const language = body?.language === "en" ? "en" : "es";
  if (!context || context.length > MAX_CONTEXT_CHARS) {
    return json(
      { error: "Faltan datos de análisis o superan el límite permitido" },
      400,
    );
  }

  // The browser key helps with normal use; the IP limiter prevents trivial key rotation.
  if (env.AI_RATE_LIMITER) {
    const clientKey = request.headers.get("x-client-key") || "anonymous";
    if (!/^[a-f0-9-]{36}$/i.test(clientKey))
      return json({ error: "Identificador de sesión inválido" }, 400);
    const { success } = await env.AI_RATE_LIMITER.limit({ key: clientKey });
    if (!success)
      return json(
        { error: "Límite temporal alcanzado; inténtalo en un minuto" },
        429,
      );
  }
  if (env.AI_IP_RATE_LIMITER) {
    const ipAddress = request.headers.get("cf-connecting-ip");
    if (!ipAddress)
      return json({ error: "No se pudo validar la solicitud" }, 403);
    const { success } = await env.AI_IP_RATE_LIMITER.limit({ key: ipAddress });
    if (!success)
      return json(
        { error: "Límite temporal alcanzado; inténtalo en un minuto" },
        429,
      );
  }

  try {
    const text =
      env.AI_PROVIDER === "gemini"
        ? await runGemini(context, env, language)
        : await runOpenWeight(context, env, language);
    if (!text)
      return json({ error: "El modelo no devolvió una interpretación" }, 502);
    return json({
      text: text.slice(0, 4500),
      provider: env.AI_PROVIDER === "gemini" ? "gemini" : "open-weight",
    });
  } catch (error) {
    console.error(
      "AI interpretation failed",
      error instanceof Error ? error.message : "unknown error",
    );
    const detail = error instanceof Error ? error.message : "";
    return json(
      {
        error: /allocation|neurons|quota/i.test(detail)
          ? "La cuota diaria del modelo se agotó. Mientras tanto se muestra la lectura calculada con tus datos."
          : "No se pudo obtener una interpretación del modelo",
      },
      502,
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/"))
      return withSecurityHeaders(await handleApi(request, env));
    const response = await env.ASSETS.fetch(request);
    return withSecurityHeaders(response);
  },
};
