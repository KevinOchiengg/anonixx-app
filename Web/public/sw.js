self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch { p = { body: event.data && event.data.text() }; }
  const data = p.data || {};
  event.waitUntil(
    self.registration.showNotification(p.title || "Anonixx", {
      body: p.body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      data,
      actions: Array.isArray(data.actions) ? data.actions : undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  // "Accept" on a link up push accepts straight from the notification.
  const url = (event.action === "accept" && d.accept_url) || d.url || "/inbox";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { await c.focus(); if ("navigate" in c) { try { await c.navigate(url); } catch (e) {} } return; }
    }
    await self.clients.openWindow(url);
  })());
});
