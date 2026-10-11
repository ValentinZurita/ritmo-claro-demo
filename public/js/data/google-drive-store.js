// File map: find or create the Drive file and read or write the JSON store.

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FILE_NAME = "Ritmo Claro";
const QUERY =
  "appProperties has { key='ritmoClaro' and value='store' } and trashed=false";

export function emptyStore() {
  return {
    version: 1,
    runs: [],
    goal: null,
    onboardingComplete: false,
    extraMeta: {},
  };
}

async function readError(response) {
  try {
    const payload = await response.json();
    return payload.error?.message || "No se pudo hablar con Google Drive";
  } catch {
    return "No se pudo hablar con Google Drive";
  }
}

async function drive(url, token, options = {}) {
  const headers = {
    authorization: `Bearer ${token}`,
    ...(options.body && !options.raw
      ? { "content-type": "application/json" }
      : {}),
    ...options.headers,
  };
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.raw
      ? options.body
      : options.body
        ? JSON.stringify(options.body)
        : undefined,
  });
  if (!response.ok) {
    const error = new Error(await readError(response));
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function findOrCreateFile(token) {
  const found = await drive(
    `${DRIVE}/files?q=${encodeURIComponent(QUERY)}&spaces=drive&fields=files(id,name)&pageSize=1`,
    token,
  );
  if (found?.files?.[0]?.id) return found.files[0].id;

  const created = await drive(`${DRIVE}/files`, token, {
    method: "POST",
    body: {
      name: FILE_NAME,
      mimeType: "application/json",
      appProperties: { ritmoClaro: "store" },
    },
  });
  if (!created?.id) throw new Error("No se pudo crear el archivo en Drive");
  await writeStore(token, created.id, emptyStore());
  return created.id;
}

export async function readStore(token, fileId) {
  const loaded = await drive(
    `${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media`,
    token,
  );
  if (!loaded || typeof loaded !== "object") return emptyStore();
  return {
    ...emptyStore(),
    runs: Array.isArray(loaded.runs) ? loaded.runs : [],
    goal: loaded.goal || null,
    onboardingComplete: Boolean(loaded.onboardingComplete),
    extraMeta:
      loaded.extraMeta && typeof loaded.extraMeta === "object"
        ? loaded.extraMeta
        : {},
  };
}

export async function writeStore(token, fileId, payload) {
  const body = JSON.stringify({
    version: 1,
    runs: payload.runs || [],
    goal: payload.goal || null,
    onboardingComplete: Boolean(payload.onboardingComplete),
    extraMeta: payload.extraMeta || {},
  });
  await drive(
    `${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media`,
    token,
    {
      method: "PATCH",
      raw: true,
      headers: { "content-type": "application/json" },
      body,
    },
  );
}
