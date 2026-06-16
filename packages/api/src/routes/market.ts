import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { getActorId } from "../audit";
import { fetchAccount, fetchHistory, fetchOhlc, fetchSymbols, fetchTrades } from "../bridge";

const CandleSchema = z
  .object({
    time: z.number().openapi({ example: 1700000000 }),
    open: z.number().openapi({ example: 1.08123 }),
    high: z.number().openapi({ example: 1.08245 }),
    low: z.number().openapi({ example: 1.08012 }),
    close: z.number().openapi({ example: 1.08189 }),
    tickVolume: z.number().openapi({ example: 234 }),
    spread: z.number().openapi({ example: 8 }),
  })
  .openapi("Candle");

const OHLCResponse = z
  .object({
    symbol: z.string(),
    timeframe: z.string(),
    candles: z.array(CandleSchema),
  })
  .openapi("OHLCResponse");

const PositionSchema = z
  .object({
    ticket: z.number().openapi({ example: 12345678 }),
    symbol: z.string().openapi({ example: "EURUSD" }),
    type: z.string().openapi({ example: "buy" }),
    volume: z.number().openapi({ example: 0.1 }),
    priceOpen: z.number().openapi({ example: 1.08123 }),
    priceCurrent: z.number().openapi({ example: 1.08245 }),
    profit: z.number().openapi({ example: 12.2 }),
    swap: z.number().openapi({ example: -0.45 }),
    commission: z.number().openapi({ example: -0.5 }),
    sl: z.number().openapi({ example: 1.078 }),
    tp: z.number().openapi({ example: 1.085 }),
    openTime: z.number().openapi({ example: 1700000000 }),
    comment: z.string().openapi({ example: "SL: 1.07800" }),
  })
  .openapi("Position");

const OrderSchema = z
  .object({
    ticket: z.number().openapi({ example: 12345679 }),
    symbol: z.string().openapi({ example: "EURUSD" }),
    type: z.string().openapi({ example: "buy_limit" }),
    volume: z.number().openapi({ example: 0.1 }),
    price: z.number().openapi({ example: 1.078 }),
    sl: z.number().optional().openapi({ example: 1.076 }),
    tp: z.number().optional().openapi({ example: 1.085 }),
    openTime: z.number().openapi({ example: 1700000000 }),
    comment: z.string().optional().openapi({ example: "Limit order" }),
    magic: z.number().optional().openapi({ example: 0 }),
  })
  .openapi("Order");

const TradesResponse = z
  .object({
    positions: z.array(PositionSchema),
    orders: z.array(OrderSchema),
  })
  .openapi("TradesResponse");

const AccountResponse = z
  .object({
    login: z.number().openapi({ example: 123456 }),
    balance: z.number().openapi({ example: 10000.0 }),
    equity: z.number().openapi({ example: 10500.0 }),
    margin: z.number().openapi({ example: 500.0 }),
    marginFree: z.number().openapi({ example: 9500.0 }),
    profit: z.number().openapi({ example: 500.0 }),
    leverage: z.number().openapi({ example: 100 }),
    server: z.string().openapi({ example: "MetaQuotes-Demo" }),
    currency: z.string().openapi({ example: "USD" }),
    name: z.string().openapi({ example: "Demo Account" }),
    tradeMode: z.number().optional().openapi({ example: 1 }),
    marginLevel: z.number().optional().openapi({ example: 2000.0 }),
  })
  .openapi("AccountResponse");

const DealSchema = z
  .object({
    ticket: z.number().openapi({ example: 12345678 }),
    symbol: z.string().openapi({ example: "EURUSD" }),
    type: z.string().openapi({ example: "buy" }),
    volume: z.number().openapi({ example: 0.1 }),
    price: z.number().openapi({ example: 1.08123 }),
    profit: z.number().openapi({ example: 12.2 }),
    commission: z.number().openapi({ example: -0.5 }),
    swap: z.number().openapi({ example: -0.12 }),
    time: z.number().openapi({ example: 1700000000 }),
    comment: z.string().optional().openapi({ example: "SL: 1.07800" }),
    magic: z.number().optional().openapi({ example: 0 }),
  })
  .openapi("Deal");

const HistoryOrderSchema = z
  .object({
    ticket: z.number().openapi({ example: 12345679 }),
    symbol: z.string().openapi({ example: "EURUSD" }),
    type: z.string().openapi({ example: "buy_limit" }),
    volume: z.number().openapi({ example: 0.1 }),
    price: z.number().openapi({ example: 1.078 }),
    sl: z.number().optional().openapi({ example: 1.076 }),
    tp: z.number().optional().openapi({ example: 1.085 }),
    time: z.number().openapi({ example: 1700000000 }),
    comment: z.string().optional().openapi({ example: "Limit order" }),
    magic: z.number().optional().openapi({ example: 0 }),
  })
  .openapi("HistoryOrder");

const HistoryResponse = z
  .object({
    deals: z.array(DealSchema),
    orders: z.array(HistoryOrderSchema).optional(),
  })
  .openapi("HistoryResponse");

const ohlcRoute = createRoute({
  method: "get",
  path: "/instances/{name}/market/ohlc",
  request: {
    params: z.object({ name: z.string() }),
    query: z.object({
      symbol: z.string().optional().default("EURUSD").openapi({ example: "EURUSD" }),
      timeframe: z.string().optional().default("M1").openapi({ example: "M1" }),
      count: z.coerce.number().optional().default(100).openapi({ example: 100 }),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: OHLCResponse } },
      description: "OHLC data",
    },
    401: { description: "Unauthorized" },
    503: {
      content: { "application/json": { schema: z.object({ error: z.string() }) } },
      description: "Bridge not available",
    },
  },
});

const tradesRoute = createRoute({
  method: "get",
  path: "/instances/{name}/market/trades",
  request: {
    params: z.object({ name: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: TradesResponse } },
      description: "Open trades",
    },
    401: { description: "Unauthorized" },
    503: {
      content: { "application/json": { schema: z.object({ error: z.string() }) } },
      description: "Bridge not available",
    },
  },
});

const accountRoute = createRoute({
  method: "get",
  path: "/instances/{name}/market/account",
  request: {
    params: z.object({ name: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: AccountResponse } },
      description: "Account info",
    },
    401: { description: "Unauthorized" },
    503: {
      content: { "application/json": { schema: z.object({ error: z.string() }) } },
      description: "Bridge not available",
    },
  },
});

const historyRoute = createRoute({
  method: "get",
  path: "/instances/{name}/market/history",
  request: {
    params: z.object({ name: z.string() }),
    query: z.object({
      from: z.coerce.number().optional().openapi({ example: 1699920000 }),
      to: z.coerce.number().optional().openapi({ example: 1700000000 }),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: HistoryResponse } },
      description: "Trade history",
    },
    401: { description: "Unauthorized" },
    503: {
      content: { "application/json": { schema: z.object({ error: z.string() }) } },
      description: "Bridge not available",
    },
  },
});

const symbolsRoute = createRoute({
  method: "get",
  path: "/instances/{name}/market/symbols",
  request: {
    params: z.object({ name: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            symbols: z.array(
              z.object({
                name: z.string(),
                bid: z.number(),
                ask: z.number(),
                spread: z.number(),
                digits: z.number(),
                tradeMode: z.number(),
                volumeMin: z.number(),
                volumeMax: z.number(),
                volumeStep: z.number(),
              }),
            ),
          }),
        },
      },
      description: "Available symbols",
    },
    401: { description: "Unauthorized" },
    503: {
      content: { "application/json": { schema: z.object({ error: z.string() }) } },
      description: "Bridge not available",
    },
  },
});

export function marketRoutes(app: OpenAPIHono) {
  app.openapi(ohlcRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const { symbol, timeframe, count } = c.req.valid("query");
    try {
      const data = await fetchOhlc(name, symbol ?? "EURUSD", timeframe, count);
      return c.json(data, 200);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 503);
    }
  });

  app.openapi(tradesRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    try {
      const data = await fetchTrades(name);
      return c.json(data, 200);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 503);
    }
  });

  app.openapi(accountRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    try {
      const data = await fetchAccount(name);
      return c.json(data, 200);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 503);
    }
  });

  app.openapi(historyRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const { from, to } = c.req.valid("query");
    try {
      const data = await fetchHistory(name, from, to);
      return c.json(data, 200);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 503);
    }
  });

  app.openapi(symbolsRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    try {
      const data = await fetchSymbols(name);
      return c.json(data, 200);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 503);
    }
  });
}
