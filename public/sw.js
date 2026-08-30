// sw.js — Service Worker do Elite Lab Hub
// Estratégia: network-first para navegação e assets compilados.
// Importante: nunca cachear módulos de desenvolvimento do Vite, pois isso pode
// misturar chunks antigos/novos e causar "Invalid hook call" no React.

const CACHE_NAME = "elite-lab-v4-20260830";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
];

// Instala e pré-cacheia assets essenciais
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Limpa caches antigos ao ativar
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições não-GET e chamadas Supabase/Cloudinary (sempre online)
  if (request.method !== "GET") return;
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("cloudinary.com")
  ) return;

  // Ambiente de preview/dev do Vite: sempre rede, sem cache de módulos.
  if (
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/@") ||
    url.pathname === "/@vite/client" ||
    url.searchParams.has("v") ||
    url.searchParams.has("t")
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // Para navegação (HTML): Network-first, fallback para index.html (SPA)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Mantém o shell offline sempre atualizado com a última versão vista.
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", clone));
          }
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Para assets JS/CSS/imagens: network-first para evitar bundles obsoletos.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
