// App-shell cache. Rates are never cached here: they live in localStorage with
// their observedAt, so the app can say how old they are. Bump VERSION on deploy.
const VERSION = "ci-shell-v5";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./icon.svg",
  "./core/index.js", "./core/dec.js", "./core/currencies.js", "./core/money.js", "./core/rates.js",
  "./core/convert.js", "./core/compare.js", "./core/split.js", "./core/providers.js", "./core/cache.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // rate APIs go straight to the network
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
