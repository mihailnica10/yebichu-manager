import { serve } from "bun";

const PORT = Number.parseInt(process.env.PORT || "3556");
const ROOT = process.argv[2] || "./dist";
const API_URL = process.env.API_URL || "http://localhost:3001";

console.log(`Serving ${ROOT} on port ${PORT}, proxying /api to ${API_URL}`);

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/")) {
      const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await req.text() : undefined;
      const headers = new Headers(req.headers);
      headers.set("Host", new URL(API_URL).host);

      const apiRes = await fetch(API_URL + url.pathname + url.search, {
        method: req.method,
        headers,
        body,
      });
      const text = await apiRes.text();
      const resHeaders = new Headers();
      apiRes.headers.forEach((val, key) => resHeaders.set(key, val));
      return new Response(text, { status: apiRes.status, headers: resHeaders });
    }

    let path = url.pathname;
    if (path === "/") path = "/index.html";

    const filePath = ROOT + path;
    const file = Bun.file(filePath);

    if (await file.exists()) {
      return new Response(file);
    }

    const index = Bun.file(`${ROOT}/index.html`);
    if (await index.exists()) {
      return new Response(index);
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Web UI running at http://localhost:${PORT}`);
