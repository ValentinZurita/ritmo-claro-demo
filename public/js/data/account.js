// File map: guest vs Google session, token refresh, and Drive store calls.

import { GOOGLE_CLIENT_ID } from "./google-client-id.js";
import {
  findOrCreateFile,
  readStore,
  writeStore,
} from "./google-drive-store.js";

const SESSION_KEY = "ritmo-claro-google-v1";
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

let activeMode = "guest";
let popupClient = null;
let redirectClient = null;
let tokenWaiter = null;
let pendingRedirect = null;
let clientIdPromise = null;

export function setActiveMode(mode) {
  activeMode = mode === "cloud" ? "cloud" : "guest";
}

export function isCloudAccount() {
  return activeMode === "cloud";
}

export function readSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (
      saved?.mode === "cloud" &&
      saved.token &&
      saved.fileId &&
      saved.username
    )
      return saved;
  } catch {}
  return null;
}

export function writeSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function redirectUri() {
  return `${location.origin}/`;
}

async function getClientId() {
  if (!clientIdPromise) {
    clientIdPromise = fetch("/api/google-config")
      .then((response) => (response.ok ? response.json() : {}))
      .then((data) => String(data.clientId || "").trim())
      .catch(() => "")
      .then((id) => id || GOOGLE_CLIENT_ID);
  }
  return clientIdPromise;
}

function waitForGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - started > 8000) {
        clearInterval(timer);
        reject(new Error("No se pudo abrir Google"));
      }
    }, 50);
  });
}

function handleTokenResponse(response) {
  if (response.error) {
    tokenWaiter?.reject(new Error("No se pudo entrar con Google"));
    tokenWaiter = null;
    return;
  }
  if (tokenWaiter) {
    tokenWaiter.resolve(response);
    tokenWaiter = null;
    return;
  }
  pendingRedirect = response;
}

function handleTokenError(error) {
  if (
    error?.type === "popup_closed" ||
    error?.type === "popup_failed_to_open"
  ) {
    return;
  }
  tokenWaiter?.reject(new Error("No se pudo entrar con Google"));
  tokenWaiter = null;
}

async function createTokenClient(uxMode) {
  const clientId = await getClientId();
  if (!clientId) throw new Error("Esta copia aún no está conectada a Google.");
  await waitForGis();
  const options = {
    client_id: clientId,
    scope: SCOPES,
    ux_mode: uxMode,
    callback: handleTokenResponse,
    error_callback: handleTokenError,
  };
  if (uxMode === "redirect") options.redirect_uri = redirectUri();
  return window.google.accounts.oauth2.initTokenClient(options);
}

async function getPopupClient() {
  if (!popupClient) popupClient = await createTokenClient("popup");
  return popupClient;
}

async function getRedirectClient() {
  if (!redirectClient) redirectClient = await createTokenClient("redirect");
  return redirectClient;
}

function requestAccessToken(prompt, mode = "popup") {
  return (mode === "redirect" ? getRedirectClient() : getPopupClient()).then(
    (client) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (tokenWaiter) {
            tokenWaiter = null;
            reject(new Error("Google no respondió. Inténtalo otra vez."));
          }
        }, 120000);
        tokenWaiter = {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        };
        client.requestAccessToken(
          prompt === "" ? { prompt: "" } : prompt ? { prompt } : {},
        );
      }),
  );
}

function withExpiry(session, tokenResponse) {
  const seconds = Number(tokenResponse.expires_in) || 3600;
  return {
    ...session,
    token: tokenResponse.access_token,
    expiresAt: Date.now() + seconds * 1000 - 60_000,
  };
}

async function fetchProfile(token) {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    {
      headers: { authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) throw new Error("No se pudo leer tu cuenta de Google");
  return response.json();
}

async function completeSignIn(tokenResponse) {
  const profile = await fetchProfile(tokenResponse.access_token);
  const fileId = await findOrCreateFile(tokenResponse.access_token);
  writeSession(
    withExpiry(
      {
        mode: "cloud",
        username: profile.name || profile.email || "Google",
        email: profile.email || "",
        fileId,
      },
      tokenResponse,
    ),
  );
}

export async function consumeGoogleRedirect() {
  try {
    await getRedirectClient();
  } catch {
    return false;
  }
  if (!pendingRedirect) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!pendingRedirect) return false;
  const tokenResponse = pendingRedirect;
  pendingRedirect = null;
  await completeSignIn(tokenResponse);
  return true;
}

export async function ensureAccessToken() {
  const session = readSession();
  if (!session) throw new Error("Entra otra vez");
  if (session.expiresAt && Date.now() < session.expiresAt) return session;
  const updated = withExpiry(session, await requestAccessToken(""));
  writeSession(updated);
  return updated;
}

export async function signInWithGoogle() {
  await completeSignIn(await requestAccessToken("consent", "redirect"));
}

export function signOutGoogle() {
  const session = readSession();
  if (session?.token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(session.token, () => {});
  }
  clearSession();
}

export async function fetchStore() {
  const session = await ensureAccessToken();
  const loaded = await readStore(session.token, session.fileId);
  return { ...loaded, username: session.username };
}

export async function saveStore(payload) {
  const session = await ensureAccessToken();
  await writeStore(session.token, session.fileId, payload);
}
