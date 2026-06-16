#!/usr/bin/env python3
"""MT5 Bridge - HTTP API for MetaTrader 5 data.

Deploy inside the MT5 Docker container alongside the terminal.
Exposes REST endpoints for OHLC data, positions, account info, and trade history.

Usage:
  python mt5-bridge.py [--port 8090]

Requires: MetaTrader5 (pip install MetaTrader5)
Uses Python's built-in http.server (no Flask dependency).
"""

import json
import http.server
import argparse
import time
from urllib.parse import urlparse, parse_qs

try:
    import MetaTrader5 as mt5
except ImportError:
    mt5 = None
    print("WARNING: MetaTrader5 module not found. Run: pip install MetaTrader5")


TIMEFRAME_MAP = {
    "M1": mt5.TIMEFRAME_M1 if mt5 else None,
    "M5": mt5.TIMEFRAME_M5 if mt5 else None,
    "M15": mt5.TIMEFRAME_M15 if mt5 else None,
    "H1": mt5.TIMEFRAME_H1 if mt5 else None,
    "H4": mt5.TIMEFRAME_H4 if mt5 else None,
    "D1": mt5.TIMEFRAME_D1 if mt5 else None,
}

POSITION_TYPE_MAP = {0: "buy", 1: "sell"} if mt5 else {}
DEAL_TYPE_MAP = {0: "buy", 1: "sell"} if mt5 else {}
ORDER_TYPE_MAP = {
    0: "buy", 1: "sell", 2: "buy_limit", 3: "sell_limit",
    4: "buy_stop", 5: "sell_stop",
} if mt5 else {}


def init_mt5():
    if mt5 is None:
        return False
    if not mt5.initialize():
        print(f"MT5 init failed: {mt5.last_error()}")
        return False
    return True


def get_ohlc(symbol, timeframe, count):
    tf = TIMEFRAME_MAP.get(timeframe, mt5.TIMEFRAME_M1 if mt5 else None)
    if tf is None:
        return {"error": f"Invalid timeframe: {timeframe}"}
    if mt5 is None:
        return {"error": "MetaTrader5 not available"}
    rates = mt5.copy_rates_from_pos(symbol, tf, 0, count)
    if rates is None:
        return {"error": f"Failed to get rates for {symbol}: {mt5.last_error()}"}
    candles = [
        {
            "time": int(r[0]),
            "open": r[1],
            "high": r[2],
            "low": r[3],
            "close": r[4],
            "tickVolume": r[5],
            "spread": r[6],
        }
        for r in rates
    ]
    return {"symbol": symbol, "timeframe": timeframe, "candles": candles}


def get_trades():
    if mt5 is None:
        return {"error": "MetaTrader5 not available"}
    positions = mt5.positions_get()
    orders = mt5.orders_get()
    pos_list = []
    if positions:
        for p in positions:
            pos_list.append({
                "ticket": p.ticket,
                "symbol": p.symbol,
                "type": POSITION_TYPE_MAP.get(p.type, "unknown"),
                "volume": p.volume,
                "priceOpen": p.price_open,
                "priceCurrent": p.price_current,
                "profit": p.profit,
                "swap": p.swap,
                "openTime": int(p.time),
            })
    ord_list = []
    if orders:
        for o in orders:
            ord_list.append({
                "ticket": o.ticket,
                "symbol": o.symbol,
                "type": ORDER_TYPE_MAP.get(o.type, "unknown"),
                "volume": o.volume,
                "price": o.price_open,
                "sl": o.sl,
                "tp": o.tp,
                "openTime": int(o.time_setup),
            })
    return {"positions": pos_list, "orders": ord_list}


def get_account():
    if mt5 is None:
        return {"error": "MetaTrader5 not available"}
    info = mt5.account_info()
    if info is None:
        return {"error": f"Failed to get account info: {mt5.last_error()}"}
    return {
        "login": info.login,
        "balance": info.balance,
        "equity": info.equity,
        "margin": info.margin,
        "marginFree": info.margin_free,
        "profit": info.profit,
        "leverage": info.leverage,
        "server": info.server,
        "currency": info.currency,
        "name": info.name,
    }


def get_history(from_time, to_time):
    if mt5 is None:
        return {"error": "MetaTrader5 not available"}
    deals = mt5.history_deals_get(from_time, to_time)
    deal_list = []
    if deals:
        for d in deals:
            deal_list.append({
                "ticket": d.ticket,
                "symbol": d.symbol,
                "type": DEAL_TYPE_MAP.get(d.type, "unknown"),
                "volume": d.volume,
                "price": d.price,
                "profit": d.profit,
                "commission": d.commission,
                "swap": d.swap,
                "time": int(d.time),
                "comment": d.comment or "",
            })
    return {"deals": deal_list}


class MT5Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        params = parse_qs(parsed.query)

        def p(name, default=None):
            vals = params.get(name)
            return vals[0] if vals else default

        status = 200
        data = {"error": "Not found"}

        if path == "/ohlc":
            symbol = p("symbol", "EURUSD")
            timeframe = p("timeframe", "M1")
            count = int(p("count", "100"))
            data = get_ohlc(symbol, timeframe, count)

        elif path == "/trades":
            data = get_trades()

        elif path == "/account":
            data = get_account()

        elif path == "/history":
            now = int(time.time())
            from_ts = int(p("from", str(now - 86400 * 7)))
            to_ts = int(p("to", str(now)))
            data = get_history(from_ts, to_ts)

        if "error" in data:
            status = 400

        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def log_message(self, format, *args):
        print(f"[MT5-Bridge] {args[0]} {args[1]} {args[2]}")


def main():
    parser = argparse.ArgumentParser(description="MT5 Bridge HTTP API")
    parser.add_argument("--port", type=int, default=8090, help="Port to listen on")
    args = parser.parse_args()

    connected = False
    if mt5 is not None:
        connected = init_mt5()
        if connected:
            print("MT5 initialized successfully")
        else:
            print("MT5 initialization failed, serving errors")

    server = http.server.HTTPServer(("0.0.0.0", args.port), MT5Handler)
    print(f"MT5 Bridge listening on port {args.port}")
    print(f"  GET /ohlc?symbol=EURUSD&timeframe=M1&count=100")
    print(f"  GET /trades")
    print(f"  GET /account")
    print(f"  GET /history?from=1700000000&to=1700000000")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        if connected and mt5:
            mt5.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
