// Bostie's service worker. It exists for one thing: showing get-off alerts as phone
// notifications. It caches nothing and never touches network requests.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((open) => (open[0] ? open[0].focus() : self.clients.openWindow("/journey"))),
  );
});
