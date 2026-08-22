self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "FidiManager";
  const body = payload.body || "";
  const url = payload.url || "/";
  const tag = payload.tag || "default";
  const icon = payload.icon || "/icons/made-any.png";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon,
      badge: "/icons/made-any.png",
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if (client.url && "focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              // ignore navigation errors
            }
          }
          return;
        }
      }

      await self.clients.openWindow(url);
    })()
  );
});
