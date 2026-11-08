const CACHE_NAME = "lifeos-shell-v2";
const APP_SHELL = ["/", "/habitudes", "/progression", "/donnees", "/reglages", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((error) => console.warn("Préchargement hors ligne partiel.", error))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (error) {
      console.warn("Contenu de notification non JSON.", error);
    }
  }
  const notification = payload && typeof payload === "object" ? payload : {};
  event.waitUntil(self.registration.showNotification(
    typeof notification.title === "string" ? notification.title : "LifeOS",
    {
      body: typeof notification.body === "string" ? notification.body : "Un petit pas t’attend.",
      icon: "/images/logo.svg",
      badge: "/images/logo.svg",
      data: { url: typeof notification.url === "string" ? notification.url : "/" },
    },
  ));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(
    typeof event.notification.data?.url === "string" ? event.notification.data.url : "/",
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const current = clients.find((client) => client.url === destination);
      if (current) return current.focus();
      return self.clients.openWindow(destination);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(async () => (await caches.match(request)) ?? (await caches.match("/")) ?? Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith("/images/") || url.pathname === "/manifest.json" || url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});
