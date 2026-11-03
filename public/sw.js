const CACHE_NAME = "simulatore-bollette-pwa-v6";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest?v=3",
  "/pwa-icon-192-v2.png",
  "/pwa-icon-512-v2.png",
  "/pwa-icon-maskable-512-v2.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Le API non devono mai essere servite dalla cache PWA:
  // i dati di mercato devono arrivare sempre dalla rete.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => response)
        .catch(() =>
          new Response(
            JSON.stringify({ error: "API non disponibile" }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            }
          )
        )
    );
    return;
  }

  // HTML, JS e CSS devono privilegiare sempre la rete:
  // evita che mobile/PWA continui a mostrare una build precedente.
  const isAppAsset =
    request.mode === "navigate" ||
    request.destination === "script" ||
    request.destination === "style" ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css");

  if (isAppAsset) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy);
            });
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (request.mode === "navigate") {
            return caches.match("/");
          }
          throw new Error("Risorsa non disponibile offline");
        })
    );
    return;
  }

  // Immagini e risorse statiche non critiche: cache-first.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, copy);
          });
        }
        return response;
      });
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = String(payload.title || "Promemoria calendario");
  const body = String(payload.body || "Hai un appuntamento in programma.");
  const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.date || "")) ? payload.date : "";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/pwa-icon-192-v2.png",
    badge: "/pwa-icon-192-v2.png",
    tag: String(payload.tag || "recruiting-calendar-reminder"),
    renotify: true,
    data: { url: "/#recruiting", date: eventDate },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const url = new URL("/", self.location.origin);
    url.hash = "recruiting";
    if (data.date) url.searchParams.set("calendar_date", data.date);
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(url.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(url.href);
  })());
});
