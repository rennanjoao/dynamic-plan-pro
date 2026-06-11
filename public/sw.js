// sw.js — Service Worker do Elite Lab Hub
// Estratégia: Network-first para API/Supabase, Cache-first para assets estáticos

const CACHE_NAME = "elite-lab-v1";
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

  // Para navegação (HTML): Network-first, fallback para index.html (SPA)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/index.html")
      )
    );
    return;
  }

  // Para assets JS/CSS/imagens: Cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
