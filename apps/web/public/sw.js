// Keeps the app shell and the "call 112" audio on the phone, so SOS still opens with no network.
// Pages use the network first, because a stale page after a deployment caused real confusion.
const CACHE = "ayu-v1";
const CORE = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/pcm-worklet.js",
  ...["en", "hi", "hinglish"].flatMap((lang) => [`/audio/opening-${lang}.pcm`, `/audio/offline-${lang}.pcm`]),
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const save = async (request, response) => {
  if (response.ok) await (await caches.open(CACHE)).put(request, response.clone());
  return response;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET") return;

  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!fonts && url.origin !== self.location.origin) return;
  // Case data and anything live must never be served from a cache.
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/ws")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => save(request, response)).catch(async () => (await caches.match(request)) ?? caches.match("/")));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then((response) => save(request, response))));
});
