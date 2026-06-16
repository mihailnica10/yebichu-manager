"use client";
import { CandlestickChart } from "@/components/candlestick-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSocket } from "@/hooks/useSocket";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "ETHUSD"] as const;
const TIMEFRAMES = ["M1", "M5", "M15", "H1", "H4", "D1"] as const;

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
  spread: number;
}

interface Position {
  ticket: number;
  symbol: string;
  type: "buy" | "sell";
  volume: number;
  priceOpen: number;
  priceCurrent: number;
  profit: number;
  swap: number;
  openTime: number;
}

interface Order {
  ticket: number;
  symbol: string;
  type: string;
  volume: number;
  price: number;
  sl?: number;
  tp?: number;
  openTime: number;
}

interface Account {
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
}

function formatPrice(value: number, symbol: string): string {
  const digits = symbol === "BTCUSD" || symbol === "ETHUSD" ? 2 : 5;
  return value.toFixed(digits);
}

function formatProfit(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}$${value.toFixed(2)}`;
}

function isBridge503(error: unknown): boolean {
  if (error && typeof error === "object" && "response" in error) {
    const resp = (error as { response: { status: number } }).response;
    return resp?.status === 503;
  }
  return false;
}

export function MarketPanel({ name }: { name: string }) {
  const { isConnected } = useSocket();
  const [symbol, setSymbol] = useState<string>("EURUSD");
  const [timeframe, setTimeframe] = useState<string>("M1");

  const {
    data: ohlc,
    isLoading: ohlcLoading,
    isError: ohlcError,
    error: ohlcErr,
  } = useQuery({
    queryKey: ["market", "ohlc", name, symbol, timeframe],
    queryFn: async () => {
      const res = await api.get<{ symbol: string; timeframe: string; candles: Candle[] }>(
        `/instances/${name}/market/ohlc?symbol=${symbol}&timeframe=${timeframe}&count=100`,
      );
      return res.data;
    },
    refetchInterval: 10000,
    enabled: !!name,
  });

  const {
    data: trades,
    isLoading: tradesLoading,
    isError: tradesError,
    error: tradesErr,
  } = useQuery({
    queryKey: ["market", "trades", name],
    queryFn: async () => {
      const res = await api.get<{ positions: Position[]; orders: Order[] }>(
        `/instances/${name}/market/trades`,
      );
      return res.data;
    },
    refetchInterval: 5000,
    enabled: !!name,
  });

  const {
    data: account,
    isLoading: accountLoading,
    isError: accountError,
    error: accountErr,
  } = useQuery({
    queryKey: ["market", "account", name],
    queryFn: async () => {
      const res = await api.get<Account>(`/instances/${name}/market/account`);
      return res.data;
    },
    refetchInterval: 5000,
    enabled: !!name,
  });

  const candles = ohlc?.candles ?? [];
  const positions = trades?.positions ?? [];
  const orders = trades?.orders ?? [];

  const markers = positions.map((p) => ({
    time: p.openTime,
    position: (p.type === "buy" ? "belowBar" : "aboveBar") as "belowBar" | "aboveBar",
    color: p.type === "buy" ? "#22c55e" : "#ef4444",
    shape: (p.type === "buy" ? "arrowUp" : "arrowDown") as "arrowUp" | "arrowDown",
    text: `${p.type.toUpperCase()} ${p.volume}`,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SYMBOLS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                timeframe === tf
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {tf}
            </button>
          ))}
        </div>
        <div className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
          {!isConnected && (
            <Badge variant="secondary" className="animate-pulse">
              Connecting...
            </Badge>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          {ohlcLoading && !ohlc ? (
            <div className="flex items-center justify-center h-[500px]">
              <Spinner />
            </div>
          ) : ohlcError ? (
            <div className="flex items-center justify-center h-[500px] text-destructive">
              {isBridge503(ohlcErr) ? "Bridge not available" : "Failed to load chart data"}
            </div>
          ) : candles.length === 0 ? (
            <div className="flex items-center justify-center h-[500px] text-muted-foreground">
              No data available
            </div>
          ) : (
            <CandlestickChart candles={candles} markers={markers} height={500} />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            {accountLoading && !account ? (
              <Spinner />
            ) : accountError ? (
              <div className="text-sm text-destructive">
                {isBridge503(accountErr)
                  ? "Bridge not available"
                  : "Failed to load account data"}
              </div>
            ) : account ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="text-muted-foreground">Balance</div>
                <div className="text-right font-medium">${account.balance.toFixed(2)}</div>
                <div className="text-muted-foreground">Equity</div>
                <div className="text-right font-medium">${account.equity.toFixed(2)}</div>
                <div className="text-muted-foreground">Margin</div>
                <div className="text-right font-medium">${account.margin.toFixed(2)}</div>
                <div className="text-muted-foreground">Free Margin</div>
                <div className="text-right font-medium">${account.marginFree.toFixed(2)}</div>
                <div className="text-muted-foreground">Profit</div>
                <div
                  className={cn(
                    "text-right font-medium",
                    account.profit >= 0 ? "text-green-500" : "text-red-500",
                  )}
                >
                  {formatProfit(account.profit)}
                </div>
                <div className="text-muted-foreground">Leverage</div>
                <div className="text-right font-medium">1:{account.leverage}</div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No account data</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open Positions ({positions.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {tradesLoading && !trades ? (
              <div className="flex justify-center p-4">
                <Spinner />
              </div>
            ) : tradesError ? (
              <div className="p-4 text-sm text-destructive text-center">
                {isBridge503(tradesErr) ? "Bridge not available" : "Failed to load positions"}
              </div>
            ) : positions.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">No open positions</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Vol</TableHead>
                    <TableHead>Open</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((p) => (
                    <TableRow key={p.ticket}>
                      <TableCell className="font-medium">{p.symbol}</TableCell>
                      <TableCell>
                        <Badge
                          variant={p.type === "buy" ? "default" : "secondary"}
                          className={cn(
                            "uppercase text-[10px]",
                            p.type === "buy"
                              ? "bg-green-500/20 text-green-500"
                              : "bg-red-500/20 text-red-500",
                          )}
                        >
                          {p.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{p.volume}</TableCell>
                      <TableCell className="font-mono">
                        {formatPrice(p.priceOpen, p.symbol)}
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatPrice(p.priceCurrent, p.symbol)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-mono font-medium",
                          p.profit >= 0 ? "text-green-500" : "text-red-500",
                        )}
                      >
                        {formatProfit(p.profit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {orders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Orders ({orders.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Vol</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>SL</TableHead>
                  <TableHead>TP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.ticket}>
                    <TableCell className="font-medium">{o.symbol}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase text-[10px]">
                        {o.type.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{o.volume}</TableCell>
                    <TableCell className="font-mono">{formatPrice(o.price, o.symbol)}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {o.sl ? formatPrice(o.sl, o.symbol) : "-"}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {o.tp ? formatPrice(o.tp, o.symbol) : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
