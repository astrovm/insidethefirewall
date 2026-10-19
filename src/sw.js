// The installed app's offline copy: every file of the game, kept when the
// service worker installs, and served from there first. The build fills in
// the version and the files.
const CACHE = `insidethefirewall-${"VERSION"}`;
const FILES = [/* FILES */];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  // Drop older versions.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("insidethefirewall-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Ignore ?cheats and such, so the page is found in the cache.
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((cached) => cached ?? fetch(event.request)));
});
