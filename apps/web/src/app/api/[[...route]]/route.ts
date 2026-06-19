import { createApp } from "@mt5/api";

const app = createApp();

async function handler(req: Request) {
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/^\/api/, "");
  const newReq = new Request(url.toString(), {
    method: req.method,
    headers: req.headers,
    body: req.body,
    duplex: "half",
  });
  return app.fetch(newReq);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
