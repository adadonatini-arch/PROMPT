// Service worker di "Partita ridotta": la partita funziona anche senza rete dopo la prima apertura.
const VERSIONE = "partita-v1";
const BASE = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
const AUDIO = ["audio/regole.mp3", "audio/finale.mp3", "audio/musica.m4a"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSIONE);
    await c.addAll(BASE);
    // gli audio sono facoltativi (la musica si può anche caricare a mano): se uno manca, non blocca l'installazione
    await Promise.all(AUDIO.map(u => fetch(u).then(r => r.ok && r.status === 200 ? c.put(u, r) : null).catch(() => null)));
    self.skipWaiting();
  })());
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSIONE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Safari e Chrome chiedono l'audio a pezzi (Range): dalla cache si risponde con 206
async function daCacheConRange(req, risp) {
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  if (!m) return risp;
  const buf = await risp.arrayBuffer(), tot = buf.byteLength;
  let ini = m[1] === "" ? Math.max(0, tot - +m[2]) : +m[1];
  let fin = m[1] === "" || m[2] === "" ? tot - 1 : Math.min(+m[2], tot - 1);
  if (ini > fin || ini >= tot) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + tot } });
  return new Response(buf.slice(ini, fin + 1), { status: 206, headers: {
    "Content-Type": risp.headers.get("Content-Type") || "audio/mpeg", "Accept-Ranges": "bytes",
    "Content-Range": "bytes " + ini + "-" + fin + "/" + tot, "Content-Length": String(fin - ini + 1) } });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.includes("/api/")) return;   // le chiamate /api/ (modello locale) non si toccano
  e.respondWith((async () => {
    const c = await caches.open(VERSIONE);
    const dallaCache = await c.match(req, { ignoreSearch: true, ignoreVary: true });
    if (dallaCache) return req.headers.has("range") ? daCacheConRange(req, dallaCache) : dallaCache;
    try {
      const r = await fetch(req);
      if (r.ok && r.status === 200) c.put(req, r.clone());
      return r;
    } catch (err) {
      if (req.mode === "navigate") { const i = await c.match("index.html"); if (i) return i; }
      return new Response("Offline", { status: 503 });
    }
  })());
});
