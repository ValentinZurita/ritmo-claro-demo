// File map: header Google button and signed-in chip.

import {
  isCloudAccount,
  readSession,
  signInWithGoogle,
} from "./data/account.js";

const $ = (id) => document.getElementById(id);

function esc(value) {
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

function toast(message) {
  const node = $("toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 2600);
}

async function startGoogle() {
  try {
    await signInWithGoogle();
    window.dispatchEvent(new Event("ritmo-account-ready"));
  } catch (error) {
    toast(
      error instanceof Error ? error.message : "No se pudo entrar con Google",
    );
  }
}

export function renderAccount() {
  const slot = $("accountSlot");
  if (!slot) return;
  if (isCloudAccount()) {
    const session = readSession() || {};
    const label = esc(session.username || session.email || "Google");
    slot.innerHTML = `<span class="account-chip" title="${label}">${label}</span><button class="textbtn" type="button" id="signOut">Salir</button>`;
    $("signOut")?.addEventListener("click", () =>
      window.dispatchEvent(new Event("ritmo-account-signout")),
    );
    return;
  }
  slot.innerHTML = `<button class="btn secondary account-signin" type="button" id="signIn"><svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.6h4.8c-.2 1.1-.8 2-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.6z"/><path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.6-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3C2.4 16 5.5 18 9 18z"/><path fill="#FBBC05" d="M3.9 10.7c-.2-.6-.3-1.2-.3-1.7s.1-1.2.3-1.7V5H.9C.3 6.2 0 7.6 0 9s.3 2.8.9 4l3-2.3z"/><path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.4L15 2.4C13.5.9 11.4 0 9 0 5.5 0 2.4 2 1 4.9l2.9 2.3C4.6 5.2 6.6 3.6 9 3.6z"/></svg>Continuar con Google</button>`;
  $("signIn")?.addEventListener("click", startGoogle);
}

window.addEventListener("ritmo-persist-error", (event) => {
  toast(String(event.detail || "No se pudo guardar en tu Drive"));
});

renderAccount();
