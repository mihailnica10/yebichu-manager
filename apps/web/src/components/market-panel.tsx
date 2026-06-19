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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useMarketAccount,
  useMarketOHLC,
  useMarketOrders,
  useMarketPositions,
  useSocket,
} from "@/hooks/useSocket";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { formatPrice, formatProfit } from "@/lib/format";
import { useState } from "react";

// TODO: move to shared config
const DEFAULT_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "ETHUSD"];
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

export function MarketPanel({ name }: { name: string }) {
  const { isConnected } = useSocket();
  const [symbol, setSymbol] = useState<string>("EURUSD");

  const { data: symbols } = useQuery({
    queryKey: ["market", "symbols", name],
    queryFn: () => api.get(`/bridge/${name}/symbols`).then(r => r.data || DEFAULT_SYMBOLS),
    refetchInterval: 300_000,
    enabled: !!name,
  });
  const [timeframe, setTimeframe] = useState<string>("M1");

  const { data: candles = [] } = useMarketOHLC(name, symbol, timeframe);
  const { positions = [] } = useMarketPositions(name);
  const { orders = [] } = useMarketOrders(name);
  const { account } = useMarketAccount(name);

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
            {(symbols || DEFAULT_SYMBOLS).map((s: string) => (
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
          {candles.length === 0 ? (
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
            {account ? (
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
                    account.profit >= 0 ? "text-profit" : "text-loss",
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
            {positions.length === 0 ? (
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
                              ? "bg-profit/20 text-profit"
                              : "bg-loss/20 text-loss",
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
                          p.profit >= 0 ? "text-profit" : "text-loss",
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
