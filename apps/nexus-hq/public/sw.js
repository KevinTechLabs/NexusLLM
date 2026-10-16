// Nexus HQ service worker: shows notifications (answer ready, lab alerts) and opens the app when tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Nexus HQ", body: e.data?.text() || "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Nexus HQ", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag,
    icon: "/icons/icon-192.png?v=2", badge: "/icons/icon-192.png?v=2", data: { url: d.url || "/" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins.find((c) => c.url.startsWith(self.location.origin));
    if (w) { await w.focus(); return; }
    await self.clients.openWindow(url);
  })());
});
