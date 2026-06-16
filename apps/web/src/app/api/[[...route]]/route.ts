import { createApp } from "@mt5/api";

const app = createApp();

const _handlers = ["GET", "POST", "PUT", "DELETE"] as const;

async function handler(req: Request) {
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/^\/api/, "");
  const newReq = new Request(url.toString(), req);
  return app.fetch(newReq);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
