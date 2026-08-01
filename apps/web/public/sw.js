const CACHE = "framemute-local-v1";
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const fromBase = (path = "") => `${BASE_PATH}/${path}`;
const APP_SHELL = [
  fromBase(),
  fromBase("index.html"),
  fromBase("manifest.webmanifest"),
  fromBase("framemute-mark.svg"),
  fromBase("models/blaze_face_short_range.tflite"),
  fromBase("wasm/vision_wasm_internal.js"),
  fromBase("wasm/vision_wasm_internal.wasm"),
  fromBase("wasm/vision_wasm_module_internal.js"),
  fromBase("wasm/vision_wasm_module_internal.wasm"),
  fromBase("wasm/vision_wasm_nosimd_internal.js"),
  fromBase("wasm/vision_wasm_nosimd_internal.wasm"),
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => {
    if (cached) return cached;

    return fetch(event.request).then((response) => {
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = response.clone();
        void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      }
      return response;
    });
  }));
});
