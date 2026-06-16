import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { getActorId } from "../audit";
import { request } from "../bridge";

function withAuth(handler: (c: any) => Promise<Response>) {
  return async (c: any) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    return handler(c);
  };
}

const nameParam = z.object({ name: z.string() });

const routes = [
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/execute",
    request: { params: nameParam, body: { content: { "application/json": { schema: z.any() } } } },
    responses: { 200: { description: "Execute RPA sequence" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/focus",
    request: { params: nameParam },
    responses: { 200: { description: "Focus MT5 window" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/search-broker",
    request: { params: nameParam, body: { content: { "application/json": { schema: z.object({ query: z.string() }) } } } },
    responses: { 200: { description: "Search brokers in MT5" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/sign-in",
    request: { params: nameParam, body: { content: { "application/json": { schema: z.object({ login: z.string(), password: z.string(), server: z.string(), broker: z.string().optional() }) } } } },
    responses: { 200: { description: "Sign in via MT5 GUI" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/discover-servers",
    request: { params: nameParam, body: { content: { "application/json": { schema: z.object({ broker: z.string() }) } } } },
    responses: { 200: { description: "Discover servers for a broker" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/list-windows",
    request: { params: nameParam },
    responses: { 200: { description: "List all visible windows" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/dismiss-liveupdate",
    request: { params: nameParam },
    responses: { 200: { description: "Dismiss LiveUpdate dialogs" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/dialog/open",
    request: { params: nameParam },
    responses: { 200: { description: "Open account dialog" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/dialog/search",
    request: { params: nameParam, body: { content: { "application/json": { schema: z.object({ query: z.string() }) } } } },
    responses: { 200: { description: "Search brokers in dialog" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/dialog/select",
    request: { params: nameParam, body: { content: { "application/json": { schema: z.object({ index: z.number() }) } } } },
    responses: { 200: { description: "Select broker by index" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/dialog/next",
    request: { params: nameParam },
    responses: { 200: { description: "Click Next" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/dialog/back",
    request: { params: nameParam },
    responses: { 200: { description: "Click Back" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/dialog/cancel",
    request: { params: nameParam },
    responses: { 200: { description: "Cancel/close dialog" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/dialog/servers",
    request: { params: nameParam },
    responses: { 200: { description: "Get server list from dialog" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/dialog/state",
    request: { params: nameParam },
    responses: { 200: { description: "Get current dialog state" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/type-text",
    request: { params: nameParam, body: { content: { "application/json": { schema: z.object({ text: z.string() }) } } } },
    responses: { 200: { description: "Type text into MT5" } },
  }),
  createRoute({
    method: "post",
    path: "/instances/{name}/rpa/key",
    request: { params: nameParam, body: { content: { "application/json": { schema: z.object({ key: z.string() }) } } } },
    responses: { 200: { description: "Send key press" } },
  }),
];

export function rpaRoutes(app: OpenAPIHono) {
  const auth = withAuth;

  app.openapi(routes[0], auth(async (c) => {
    const { name } = c.req.valid("param");
    const body = c.req.valid("json");
    const res = await request(name, "/v1/rpa/execute", undefined, body);
    return c.json(res);
  }));

  app.openapi(routes[1], auth(async (c) => {
    return c.json(await request(c.req.valid("param").name, "/v1/rpa/focus", undefined, {}));
  }));

  app.openapi(routes[2], auth(async (c) => {
    const { query } = c.req.valid("json");
    return c.json(await request(c.req.valid("param").name, "/v1/rpa/search-broker", undefined, { query }));
  }));

  app.openapi(routes[3], auth(async (c) => {
    const body = c.req.valid("json");
    return c.json(await request(c.req.valid("param").name, "/v1/rpa/sign-in", undefined, body));
  }));

  app.openapi(routes[4], auth(async (c) => {
    const { broker } = c.req.valid("json");
    return c.json(await request(c.req.valid("param").name, "/v1/rpa/discover-servers", undefined, { broker }));
  }));

  app.openapi(routes[5], auth(async (c) => {
    const n = c.req.valid("param").name;
    return c.json(await request(n, "/v1/rpa/list-windows", undefined, {}));
  }));

  app.openapi(routes[6], auth(async (c) => {
    const n = c.req.valid("param").name;
    return c.json(await request(n, "/v1/rpa/dismiss-liveupdate", undefined, {}));
  }));

  app.openapi(routes[7], auth(async (c) => {
    const n = c.req.valid("param").name;
    return c.json(await request(n, "/v1/rpa/dialog/open", undefined, {}));
  }));

  app.openapi(routes[8], auth(async (c) => {
    const { query } = c.req.valid("json");
    return c.json(await request(c.req.valid("param").name, "/v1/rpa/dialog/search", undefined, { query }));
  }));

  app.openapi(routes[9], auth(async (c) => {
    const { index } = c.req.valid("json");
    return c.json(await request(c.req.valid("param").name, "/v1/rpa/dialog/select", undefined, { index }));
  }));

  app.openapi(routes[10], auth(async (c) => {
    const n = c.req.valid("param").name;
    return c.json(await request(n, "/v1/rpa/dialog/next", undefined, {}));
  }));

  app.openapi(routes[11], auth(async (c) => {
    const n = c.req.valid("param").name;
    return c.json(await request(n, "/v1/rpa/dialog/back", undefined, {}));
  }));

  app.openapi(routes[12], auth(async (c) => {
    const n = c.req.valid("param").name;
    return c.json(await request(n, "/v1/rpa/dialog/cancel", undefined, {}));
  }));

  app.openapi(routes[13], auth(async (c) => {
    const n = c.req.valid("param").name;
    return c.json(await request(n, "/v1/rpa/dialog/servers", undefined, {}));
  }));

  app.openapi(routes[14], auth(async (c) => {
    const n = c.req.valid("param").name;
    return c.json(await request(n, "/v1/rpa/dialog/state", undefined, {}));
  }));

  app.openapi(routes[15], auth(async (c) => {
    const { text } = c.req.valid("json");
    return c.json(await request(c.req.valid("param").name, "/v1/rpa/type-text", undefined, { text }));
  }));

  app.openapi(routes[16], auth(async (c) => {
    const { key } = c.req.valid("json");
    return c.json(await request(c.req.valid("param").name, "/v1/rpa/key", undefined, { key }));
  }));
}
