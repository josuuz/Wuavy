/*
  The Pulse's service worker. It exists so the browser offers to install the
  app: Chrome only shows the install prompt for a page that registers a
  worker with a fetch handler.

  It stores nothing. There is no Cache Storage here, on purpose: a clinic's
  records, messages, patients and session tokens must not survive on a shared
  or lost phone, and an authenticated page cached by mistake would be served
  to whoever opens the app next. Offline is not supported, and that is the
  trade accepted for now.

  So the fetch handler touches one thing only: Next's immutable build assets
  under /_next/static, which carry no data and whose names change on every
  deploy. Everything else — navigations, Server Actions, Supabase calls, the
  webhooks — is left to the browser, untouched. Leaving navigations alone also
  keeps the sign-in redirects intact: a worker that answers them can strip the
  redirect of a response and break the session handoff.
*/

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode === "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/_next/static/")) return;

  event.respondWith(fetch(request));
});
