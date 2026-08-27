/**
 * lazyWithRetry — wraps React.lazy with cache-busting reload.
 *
 * Quando um deploy novo invalida hashes de chunks, o browser tenta buscar
 * um arquivo (ex.: DynamicRoutine-DTRpyfGi.js) que não existe mais e dispara
 * "Failed to fetch dynamically imported module". Em vez de mostrar tela branca,
 * tentamos novamente uma vez e, persistindo o erro, forçamos um reload completo
 * (com flag em sessionStorage para evitar loop infinito).
 */
import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "lovable:chunk-reload";

function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\d]+ failed|error loading dynamically imported module/i.test(
    msg,
  );
}

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      // Sucesso: limpa flag para próximos deploys.
      try { sessionStorage.removeItem(RELOAD_KEY); } catch {
        /* sessionStorage indisponível (ex.: modo privado) — ignora, é só housekeeping */
      }
      return mod;
    } catch (err) {
      if (!isChunkLoadError(err)) throw err;

      // Retry rápido (rede momentaneamente fora).
      try {
        await new Promise((r) => setTimeout(r, 400));
        const mod = await factory();
        try { sessionStorage.removeItem(RELOAD_KEY); } catch {
        /* sessionStorage indisponível (ex.: modo privado) — ignora, é só housekeeping */
      }
        return mod;
      } catch (err2) {
        if (!isChunkLoadError(err2)) throw err2;

        // Evita loop: só recarrega uma vez por sessão.
        let alreadyReloaded = false;
        try { alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === "1"; } catch {
        /* sessionStorage indisponível (ex.: modo privado) — ignora, é só housekeeping */
      }

        if (!alreadyReloaded) {
          try { sessionStorage.setItem(RELOAD_KEY, "1"); } catch {
        /* sessionStorage indisponível (ex.: modo privado) — ignora, é só housekeeping */
      }
          // Hard reload para pegar o index.html novo (com hashes atuais).
          window.location.reload();
          // Promise pendente até o reload acontecer.
          return new Promise(() => {}) as never;
        }
        throw err2;
      }
    }
  });
}

/** Listener global: captura chunk errors fora do React.lazy (ex.: import() ad-hoc). */
export function installChunkErrorReloader() {
  const handler = (event: Event) => {
    const reason =
      (event as PromiseRejectionEvent).reason ??
      (event as ErrorEvent).error ??
      (event as ErrorEvent).message;
    if (!isChunkLoadError(reason)) return;

    let alreadyReloaded = false;
    try { alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === "1"; } catch {
        /* sessionStorage indisponível (ex.: modo privado) — ignora, é só housekeeping */
      }
    if (alreadyReloaded) return;
    try { sessionStorage.setItem(RELOAD_KEY, "1"); } catch {
        /* sessionStorage indisponível (ex.: modo privado) — ignora, é só housekeeping */
      }
    window.location.reload();
  };
  window.addEventListener("error", handler);
  window.addEventListener("unhandledrejection", handler);
}
