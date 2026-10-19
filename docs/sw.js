// The installed app's offline copy: every file of the game, kept when the
// service worker installs, and served from there first. The build fills in
// the version and the files.
const CACHE = `insidethefirewall-${"36864e5c1930"}`;
const FILES = ["./","assets/costumes/ball.svg","assets/costumes/car.svg","assets/costumes/cube.svg","assets/costumes/flame1.svg","assets/costumes/flame2.svg","assets/costumes/freeze.svg","assets/costumes/game-over.svg","assets/costumes/gravity.svg","assets/costumes/hl3.png","assets/costumes/jetpack.svg","assets/costumes/monitor.svg","assets/costumes/pickup.svg","assets/costumes/pill.svg","assets/costumes/play-hover.svg","assets/costumes/play.svg","assets/costumes/player-crouch.png","assets/costumes/player-hit.svg","assets/costumes/player-jump.svg","assets/costumes/player-normal.svg","assets/costumes/player-walk1.svg","assets/costumes/player-walk2.svg","assets/costumes/portal.svg","assets/costumes/shield.svg","assets/costumes/shoes.svg","assets/costumes/stage.svg","assets/costumes/title-remaster.png","assets/costumes/title.png","assets/costumes/virus.svg","assets/fonts/noto-sans-medium.woff2","assets/icons/icon-192.png","assets/icons/icon-512.png","assets/sounds/bad-boy.mp3","assets/sounds/death.mp3","assets/sounds/glados.mp3","assets/sounds/how-do-you-do.mp3","assets/sounds/laser.wav","assets/sounds/meow.wav","assets/sounds/monster.mp3","assets/sounds/music.mp3","game.js","icon.png","index.html","manifest.webmanifest"];

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
