import { eq, getDb, schema } from "@mt5/db";

interface BridgeConfig {
  host: string;
  port: number;
}

async function getBridgeConfig(instanceName: string): Promise<BridgeConfig | null> {
  const inst = await getDb()
    .select()
    .from(schema.instances)
    .where(eq(schema.instances.name, instanceName))
    .get();
  if (!inst) return null;
  const config = JSON.parse(inst.configJson || "{}");
  if (!config.bridgePort) return null;
  return { host: "localhost", port: config.bridgePort };
}

export async function request<T>(
  instanceName: string,
  path: string,
  params?: URLSearchParams,
  body?: any,
): Promise<T> {
  const cfg = await getBridgeConfig(instanceName);
  if (!cfg) throw new Error("MT5 bridge not configured for this instance");
  const query = params ? `?${params.toString()}` : "";
  const opts: RequestInit = { signal: AbortSignal.timeout(10000) };
  if (body) {
    opts.method = "POST";
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`http://${cfg.host}:${cfg.port}${path}${query}`, opts);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Bridge request timed out");
    }
    throw err;
  }
  if (!res.ok) {
    if (res.status === 503) throw new Error("MT5 terminal not connected");
    const text = await res.text();
    throw new Error(`Bridge error (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

// Connection
export async function bridgeInitialize(
  instanceName: string,
  path?: string,
  login?: number,
  password?: string,
  server?: string,
) {
  return request<{ success: boolean }>(instanceName, "/initialize", undefined, {
    path,
    login,
    password,
    server,
  });
}
export async function bridgeLogin(
  instanceName: string,
  login: number,
  password?: string,
  server?: string,
) {
  return request<{ success: boolean }>(instanceName, "/login", undefined, {
    login,
    password,
    server,
  });
}
export async function bridgeShutdown(instanceName: string) {
  return request<{ success: boolean }>(instanceName, "/shutdown");
}
export async function bridgeVersion(instanceName: string) {
  return request<{ major: number; minor: number; build: number; releaseDate: number }>(
    instanceName,
    "/version",
  );
}
export async function bridgeLastError(instanceName: string) {
  return request<{ code: number; description: string }>(instanceName, "/last-error");
}

// Terminal & Account
export async function bridgeTerminalInfo(instanceName: string) {
  return request<Record<string, any>>(instanceName, "/terminal-info");
}

// Symbols
export async function fetchSymbols(instanceName: string) {
  interface SymbolInfo {
    name: string;
    bid: number;
    ask: number;
    spread: number;
    digits: number;
    tradeMode: number;
    volumeMin: number;
    volumeMax: number;
    volumeStep: number;
  }
  return request<{ symbols: SymbolInfo[] }>(instanceName, "/symbols");
}
export async function bridgeSymbolsTotal(instanceName: string) {
  return request<{ total: number }>(instanceName, "/symbols-total");
}
export async function bridgeSymbolInfo(instanceName: string, symbol: string) {
  return request<Record<string, any>>(
    instanceName,
    "/symbol-info",
    new URLSearchParams({ symbol }),
  );
}
export async function bridgeSymbolSelect(instanceName: string, symbol: string, enable = true) {
  return request<{ success: boolean }>(instanceName, "/symbol-select", undefined, {
    symbol,
    enable,
  });
}

// Market Depth
export async function bridgeMarketBookAdd(instanceName: string, symbol: string) {
  return request<{ success: boolean }>(instanceName, "/market-book-add", undefined, { symbol });
}
export async function bridgeMarketBookGet(instanceName: string, symbol: string) {
  return request<{ book: any[] }>(
    instanceName,
    "/market-book-get",
    new URLSearchParams({ symbol }),
  );
}
export async function bridgeMarketBookRelease(instanceName: string, symbol: string) {
  return request<{ success: boolean }>(instanceName, "/market-book-release", undefined, { symbol });
}

// Rates
export async function fetchOhlc(
  instanceName: string,
  symbol: string,
  timeframe: string,
  count: number,
) {
  interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    tickVolume: number;
    spread: number;
    realVolume: number;
  }
  return request<{ symbol: string; timeframe: string; candles: Candle[] }>(
    instanceName,
    "/ohlc",
    new URLSearchParams({ symbol, timeframe, count: String(count) }),
  );
}
export async function bridgeCopyRatesFrom(
  instanceName: string,
  symbol: string,
  timeframe: string,
  dateFrom: number,
  count: number,
) {
  return request<{ symbol: string; timeframe: string; candles: any[] }>(
    instanceName,
    "/copy-rates-from",
    new URLSearchParams({ symbol, timeframe, date_from: String(dateFrom), count: String(count) }),
  );
}
export async function bridgeCopyRatesRange(
  instanceName: string,
  symbol: string,
  timeframe: string,
  dateFrom: number,
  dateTo: number,
) {
  return request<{ symbol: string; timeframe: string; candles: any[] }>(
    instanceName,
    "/copy-rates-range",
    new URLSearchParams({
      symbol,
      timeframe,
      date_from: String(dateFrom),
      date_to: String(dateTo),
    }),
  );
}
export async function bridgeCopyTicksFrom(
  instanceName: string,
  symbol: string,
  dateFrom: number,
  count: number,
  flags?: number,
) {
  const params = new URLSearchParams({ symbol, date_from: String(dateFrom), count: String(count) });
  if (flags !== undefined) params.set("flags", String(flags));
  return request<{ symbol: string; ticks: any[] }>(instanceName, "/copy-ticks-from", params);
}
export async function bridgeCopyTicksRange(
  instanceName: string,
  symbol: string,
  dateFrom: number,
  dateTo: number,
  flags?: number,
) {
  const params = new URLSearchParams({
    symbol,
    date_from: String(dateFrom),
    date_to: String(dateTo),
  });
  if (flags !== undefined) params.set("flags", String(flags));
  return request<{ symbol: string; ticks: any[] }>(instanceName, "/copy-ticks-range", params);
}

// Trades
export async function fetchTrades(instanceName: string) {
  interface Position {
    ticket: number;
    symbol: string;
    type: string;
    volume: number;
    priceOpen: number;
    priceCurrent: number;
    profit: number;
    swap: number;
    commission: number;
    sl: number;
    tp: number;
    openTime: number;
    comment: string;
  }
  interface Order {
    ticket: number;
    symbol: string;
    type: string;
    volume: number;
    price: number;
    sl: number;
    tp: number;
    openTime: number;
    comment: string;
    magic: number;
  }
  return request<{ positions: Position[]; orders: Order[] }>(instanceName, "/trades");
}

// Orders
export async function bridgeOrdersTotal(instanceName: string) {
  return request<{ total: number }>(instanceName, "/orders-total");
}
export async function bridgeOrdersGet(
  instanceName: string,
  symbol?: string,
  group?: string,
  ticket?: number,
) {
  const params = new URLSearchParams();
  if (symbol) params.set("symbol", symbol);
  if (group) params.set("group", group);
  if (ticket !== undefined) params.set("ticket", String(ticket));
  return request<{ orders: any[] }>(instanceName, "/orders-get", params);
}
export async function bridgeOrderCalcMargin(
  instanceName: string,
  action: number,
  symbol: string,
  volume: number,
  price: number,
) {
  return request<{ margin: number }>(instanceName, "/order-calc-margin", undefined, {
    action,
    symbol,
    volume,
    price,
  });
}
export async function bridgeOrderCalcProfit(
  instanceName: string,
  action: number,
  symbol: string,
  volume: number,
  price: number,
  priceClose: number,
) {
  return request<{ profit: number }>(instanceName, "/order-calc-profit", undefined, {
    action,
    symbol,
    volume,
    price,
    price_close: priceClose,
  });
}
export async function bridgeOrderCheck(instanceName: string, req: any) {
  return request<{ result: any }>(instanceName, "/order-check", undefined, req);
}
export async function bridgeOrderSend(instanceName: string, req: any) {
  return request<{ result: any }>(instanceName, "/order-send", undefined, req);
}

// Positions
export async function bridgePositionsTotal(instanceName: string) {
  return request<{ total: number }>(instanceName, "/positions-total");
}
export async function bridgePositionsGet(
  instanceName: string,
  symbol?: string,
  group?: string,
  ticket?: number,
) {
  const params = new URLSearchParams();
  if (symbol) params.set("symbol", symbol);
  if (group) params.set("group", group);
  if (ticket !== undefined) params.set("ticket", String(ticket));
  return request<{ positions: any[] }>(instanceName, "/positions-get", params);
}

// History
export async function fetchAccount(instanceName: string) {
  interface AccountInfo {
    login: number;
    balance: number;
    equity: number;
    margin: number;
    marginFree: number;
    profit: number;
    leverage: number;
    server: string;
    currency: string;
    name: string;
    tradeMode: number;
    marginLevel: number;
  }
  return request<AccountInfo>(instanceName, "/account");
}
export async function fetchHistory(instanceName: string, from?: number, to?: number) {
  interface HistoryDeal {
    ticket: number;
    symbol: string;
    type: string;
    volume: number;
    price: number;
    profit: number;
    commission: number;
    swap: number;
    time: number;
    comment: string;
    magic: number;
  }
  interface HistoryOrder {
    ticket: number;
    symbol: string;
    type: string;
    volume: number;
    price: number;
    sl: number;
    tp: number;
    time: number;
    comment: string;
    magic: number;
  }
  const params = new URLSearchParams();
  if (from) params.set("from", String(from));
  if (to) params.set("to", String(to));
  return request<{ deals: HistoryDeal[]; orders: HistoryOrder[] }>(
    instanceName,
    "/history",
    params,
  );
}
export async function bridgeHistoryOrdersTotal(
  instanceName: string,
  dateFrom: number,
  dateTo: number,
) {
  return request<{ total: number }>(
    instanceName,
    "/history-orders-total",
    new URLSearchParams({ from: String(dateFrom), to: String(dateTo) }),
  );
}
export async function bridgeHistoryOrdersGet(
  instanceName: string,
  dateFrom: number,
  dateTo: number,
  group?: string,
  ticket?: number,
) {
  const params = new URLSearchParams({ from: String(dateFrom), to: String(dateTo) });
  if (group) params.set("group", group);
  if (ticket !== undefined) params.set("ticket", String(ticket));
  return request<{ orders: any[] }>(instanceName, "/history-orders-get", params);
}
export async function bridgeHistoryDealsTotal(
  instanceName: string,
  dateFrom: number,
  dateTo: number,
) {
  return request<{ total: number }>(
    instanceName,
    "/history-deals-total",
    new URLSearchParams({ from: String(dateFrom), to: String(dateTo) }),
  );
}
export async function bridgeHistoryDealsGet(
  instanceName: string,
  dateFrom: number,
  dateTo: number,
  group?: string,
  ticket?: number,
) {
  const params = new URLSearchParams({ from: String(dateFrom), to: String(dateTo) });
  if (group) params.set("group", group);
  if (ticket !== undefined) params.set("ticket", String(ticket));
  return request<{ deals: any[] }>(instanceName, "/history-deals-get", params);
}

// Health
export async function fetchBridgeHealth(instanceName: string) {
  try {
    const cfg = await getBridgeConfig(instanceName);
    if (!cfg) return null;
    const res = await fetch(`http://${cfg.host}:${cfg.port}/health`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<{
      status: string;
      mt5: string;
      terminal: string;
      account: number | null;
    }>;
  } catch {
    return null;
  }
}

export async function bridgeSyncPull(
  instanceName: string,
  configSets: { id: number; version: number; setType: string }[],
): Promise<any> {
  return request<any>(instanceName, "/sync/pull", undefined, { configSets });
}
