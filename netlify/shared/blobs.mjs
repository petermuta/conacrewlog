// Netlify Blobs as simple key/value storage for the core
import { getStore } from "@netlify/blobs";
export function kvFrom(name) {
  const store = getStore({ name, consistency: "strong" });
  return {
    async get(k) { const r = await store.getWithMetadata(k, { type: "text" }); return r ? { text: r.data, etag: r.etag } : null; },
    async set(k, v, o = {}) {
      const opt = o.etag ? { onlyIfMatch: o.etag } : o.onlyIfNew ? { onlyIfNew: true } : {};
      const r = await store.set(k, v, opt);
      return !r || r.modified !== false;
    },
    async has(k) { return !!(await store.getMetadata(k)); },
  };
}
const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" };
export async function serve(req, handler) {
  try {
    const url = new URL(req.url);
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    let body = null;
    if (req.method === "POST") { try { body = await req.json(); } catch (e) { return new Response('{"error":"bad json"}', { status: 400, headers: JSON_HEADERS }); } }
    const out = await handler(kvFrom("conacrew"), { method: req.method, token, body, query: Object.fromEntries(url.searchParams) });
    if (out.raw) return new Response(out.raw, { status: out.status, headers: { "content-type": out.type, "cache-control": "private, max-age=31536000, immutable" } });
    return new Response(JSON.stringify(out.body), { status: out.status, headers: JSON_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: e.status || 500, headers: JSON_HEADERS });
  }
}
