import asyncio
import logging
from datetime import datetime, timezone
from types import SimpleNamespace

from contextlib import asynccontextmanager

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field



logger = logging.getLogger("mt5-bridge")

# Lazy MT5 backend — try rpyc first (Wine Python bridge),
# then mt5linux (Linux bridge to MT5), then official MetaTrader5 (Windows-only).
# _get_mt5() handles creation lazily with retry logic.
_mt5_backend = None
_mt5_instance = None


def _get_mt5():
    """Get or create the MT5 backend instance lazily. Retries all backends on each call."""
    global _mt5_backend, _mt5_instance

    if _mt5_instance is not None and not isinstance(_mt5_instance, SimpleNamespace):
        return _mt5_instance

    _mt5_instance = None

    # Determine which backends to try based on current state
    backends_to_try = []
    if _mt5_backend is None or _mt5_backend == "retry":
        backends_to_try = ["rpyc", "mt5linux", "official"]
    elif _mt5_backend == "rpyc":
        backends_to_try = ["rpyc", "mt5linux", "official"]
    elif _mt5_backend == "mt5linux":
        backends_to_try = ["mt5linux", "official"]
    elif _mt5_backend == "official":
        backends_to_try = ["official"]

    for backend in backends_to_try:
        try:
            if backend == "rpyc":
                import rpyc
                from rpyc.utils.classic import ClassicService
                conn = rpyc.connect(
                    "localhost", 18812,
                    service=ClassicService,
                    config={
                        "sync_request_timeout": 5,
                        "allow_pickle": True,
                        "allow_public_attrs": True,
                        "allow_all_attrs": True,
                    },
                )
                _mt5_instance = conn.modules.MetaTrader5
                _mt5_backend = "rpyc"
                logger.info("Using rpyc backend (connected to Wine Python)")
                return _mt5_instance
            elif backend == "mt5linux":
                from mt5linux import MetaTrader5
                inst = MetaTrader5()
                _mt5_instance = inst
                _mt5_backend = "mt5linux"
                logger.info("Using mt5linux backend")
                return inst
            elif backend == "official":
                import MetaTrader5 as _mt5
                _mt5_instance = _mt5
                _mt5_backend = "official"
                logger.info("Using official MetaTrader5 backend")
                return _mt5
        except ImportError:
            logger.debug("%s backend not available", backend)
            continue
        except Exception as e:
            if _mt5_backend == "retry":
                logger.debug("%s backend failed: %s", backend, e)
            else:
                logger.warning("%s backend failed: %s", backend, e)
            continue

    _mt5_backend = "retry"
    return SimpleNamespace()



@asynccontextmanager
async def lifespan(app: FastAPI):
    global _initialized, _reconnect_task
    # rpyc server is started by entrypoint.sh — no need to launch it here

    # Start periodic reconnection background task immediately
    _reconnect_task = asyncio.create_task(_periodic_reconnect())
    logger.info("Periodic reconnection task started (every 10s)")

    yield

    _reconnect_task.cancel()
    try:
        await _reconnect_task
    except asyncio.CancelledError:
        pass
    if _initialized:
        try:
            _get_mt5().shutdown()
            logger.info("MT5 shutdown")
        except Exception:
            pass


app = FastAPI(
    title="MT5 Bridge API",
    description="HTTP bridge to MetaTrader 5 terminal for trading operations.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TIMEFRAME_MAP = {
    "M1": 1,
    "M5": 5,
    "M15": 15,
    "H1": 60,
    "H4": 240,
    "D1": 1440,
}
_initialized = False
_reconnect_task = None


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


def _reset_backend():
    """Reset cached backend connection, forcing reconnection on next call."""
    global _mt5_backend, _mt5_instance, _initialized
    _mt5_backend = "retry"
    _mt5_instance = None
    _initialized = False


def _try_initialize():
    """Try to initialize MT5 terminal connection. Safe to call multiple times."""
    global _initialized
    _reset_backend()
    mt5_obj = _get_mt5()
    if mt5_obj is None or isinstance(mt5_obj, SimpleNamespace):
        return False
    try:
        result = mt5_obj.initialize()
        if result:
            _initialized = True
        return bool(result)
    except Exception:
        return False


async def _periodic_reconnect():
    """Background task that periodically checks and reconnects MT5."""
    while True:
        await asyncio.sleep(10)
        try:
            if not _check_mt5():
                if _initialized or _mt5_backend != "retry":
                    logger.info("Periodic reconnect: attempting re-initialization...")
                success = _try_initialize()
                if success:
                    logger.info("Periodic reconnect: MT5 re-initialized successfully")
                else:
                    logger.debug("Periodic reconnect: MT5 still unavailable")
        except Exception as e:
            logger.debug("Periodic reconnect error: %s", e)





# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _check_mt5():
    """Check MT5 connection and attempt re-initialization if needed."""
    if not _initialized:
        return _try_initialize()
    try:
        info = _get_mt5().terminal_info()
        if info is None:
            _reset_backend()
            return False
        return True
    except Exception:
        _reset_backend()
        return False


def _mt5_unavailable():
    return JSONResponse(status_code=503, content={"error": "MT5 not available"})


def _to_dict(obj):
    if obj is None:
        return None
    if isinstance(obj, (list, tuple)):
        return [_to_dict(v) for v in obj]
    if hasattr(obj, '_asdict'):
        d = obj._asdict()
    elif hasattr(obj, '__dict__'):
        d = obj.__dict__
    else:
        return obj
    return {k: _to_dict(v) for k, v in d.items() if not k.startswith('_')}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class Candle(BaseModel):
    time: int = Field(description="Unix timestamp in seconds")
    open: float = Field(description="Open price")
    high: float = Field(description="High price")
    low: float = Field(description="Low price")
    close: float = Field(description="Close price")
    tickVolume: int = Field(description="Tick volume")
    spread: int = Field(description="Spread in points")
    realVolume: int = Field(description="Real volume")


class OHLCResponse(BaseModel):
    symbol: str = Field(description="Symbol name")
    timeframe: str = Field(description="Timeframe string")
    candles: list[Candle] = Field(description="OHLC candles")


class Position(BaseModel):
    ticket: int = Field(description="Position ticket number")
    symbol: str = Field(description="Symbol name")
    type: str = Field(description="Position type: buy or sell")
    volume: float = Field(description="Position volume in lots")
    priceOpen: float = Field(description="Open price")
    priceCurrent: float = Field(description="Current price")
    profit: float = Field(description="Profit in deposit currency")
    swap: float = Field(description="Swap charged")
    commission: float = Field(description="Commission charged")
    sl: float = Field(description="Stop Loss level")
    tp: float = Field(description="Take Profit level")
    openTime: int = Field(description="Position open time (unix seconds)")
    comment: str = Field(description="Comment")


class Order(BaseModel):
    ticket: int = Field(description="Order ticket number")
    symbol: str = Field(description="Symbol name")
    type: str = Field(description="Order type description")
    volume: float = Field(description="Order volume in lots")
    price: float = Field(description="Order price")
    sl: float = Field(description="Stop Loss level")
    tp: float = Field(description="Take Profit level")
    openTime: int = Field(description="Order open time (unix seconds)")
    comment: str = Field(description="Comment")
    magic: int = Field(description="Expert Advisor ID")


class TradesResponse(BaseModel):
    positions: list[Position] = Field(description="Open positions")
    orders: list[Order] = Field(description="Pending orders")


class AccountResponse(BaseModel):
    login: int = Field(description="Account login number")
    balance: float = Field(description="Account balance")
    equity: float = Field(description="Account equity")
    margin: float = Field(description="Used margin")
    marginFree: float = Field(description="Free margin")
    profit: float = Field(description="Current profit")
    leverage: int = Field(description="Account leverage")
    server: str = Field(description="Trade server name")
    currency: str = Field(description="Deposit currency")
    name: str = Field(description="Account owner name")
    tradeMode: int = Field(description="Trade mode (0=real, 1=demo)")
    marginLevel: float = Field(description="Margin level percentage")


class HistoryDeal(BaseModel):
    ticket: int = Field(description="Deal ticket number")
    symbol: str = Field(description="Symbol name")
    type: str = Field(description="Deal type: buy or sell")
    volume: float = Field(description="Deal volume in lots")
    price: float = Field(description="Deal price")
    profit: float = Field(description="Profit in deposit currency")
    commission: float = Field(description="Commission charged")
    swap: float = Field(description="Swap charged")
    time: int = Field(description="Deal time (unix seconds)")
    comment: str = Field(description="Comment")
    magic: int = Field(description="Expert Advisor ID")


class HistoryOrder(BaseModel):
    ticket: int = Field(description="Order ticket number")
    symbol: str = Field(description="Symbol name")
    type: str = Field(description="Order type description")
    volume: float = Field(description="Order volume in lots")
    price: float = Field(description="Order price")
    sl: float = Field(description="Stop Loss level")
    tp: float = Field(description="Take Profit level")
    time: int = Field(description="Order time (unix seconds)")
    comment: str = Field(description="Comment")
    magic: int = Field(description="Expert Advisor ID")


class HistoryResponse(BaseModel):
    deals: list[HistoryDeal] = Field(description="Historical deals")
    orders: list[HistoryOrder] = Field(description="Historical orders")


class SymbolInfo(BaseModel):
    name: str = Field(description="Symbol name")
    bid: float = Field(description="Current bid price")
    ask: float = Field(description="Current ask price")
    spread: int = Field(description="Spread in points")
    digits: int = Field(description="Digits after decimal point")
    tradeMode: int = Field(description="Trade mode")
    volumeMin: float = Field(description="Minimum volume")
    volumeMax: float = Field(description="Maximum volume")
    volumeStep: float = Field(description="Volume step")


class SymbolsResponse(BaseModel):
    symbols: list[SymbolInfo] = Field(description="Available symbols")


class HealthResponse(BaseModel):
    status: str = Field(description="API status")
    mt5: str = Field(description="MT5 connection status")
    terminal: str = Field(description="Terminal running status")
    account: int | None = Field(description="Account login number or null")


class VersionResponse(BaseModel):
    major: int = Field(description="Major version")
    minor: int = Field(description="Minor version")
    build: int = Field(description="Build number")
    release_date: int = Field(description="Release date (unix timestamp)")


class LastErrorResponse(BaseModel):
    code: int = Field(description="Error code")
    description: str = Field(description="Error description")


class TotalResponse(BaseModel):
    total: int = Field(description="Total count")


class SymbolSelectRequest(BaseModel):
    symbol: str = Field(description="Symbol name to enable/disable")
    enable: bool = Field(default=True, description="Enable or disable symbol")


class MarketBookEntry(BaseModel):
    type: int = Field(description="Book type")
    price: float = Field(description="Price")
    volume: float = Field(description="Volume")
    volume_dbl: float = Field(description="Volume (double precision)")


class MarketBookResponse(BaseModel):
    symbol: str = Field(description="Symbol name")
    book: list[MarketBookEntry] = Field(description="Market depth entries")


class Tick(BaseModel):
    time: int = Field(description="Tick time (unix seconds)")
    bid: float = Field(description="Bid price")
    ask: float = Field(description="Ask price")
    last: float = Field(description="Last price")
    volume: int = Field(description="Volume")
    time_msc: int = Field(description="Tick time (milliseconds)")
    flags: int = Field(description="Tick flags")
    volume_real: float = Field(description="Volume (double precision)")


class TradeRequest(BaseModel):
    action: int = Field(description="Trade operation type")
    symbol: str = Field(description="Symbol name")
    volume: float = Field(description="Volume in lots")
    price: float = Field(description="Price")
    sl: float = Field(default=0.0, description="Stop Loss")
    tp: float = Field(default=0.0, description="Take Profit")
    deviation: int = Field(default=10, description="Deviation")
    magic: int = Field(default=0, description="Expert Advisor ID")
    comment: str = Field(default="", description="Comment")
    type_time: int = Field(default=0, description="Order expiration type")
    type_filling: int = Field(default=0, description="Order filling type")
    position: int = Field(default=0, description="Position ticket")
    position_by: int = Field(default=0, description="Opposite position")


class TradeResult(BaseModel):
    retcode: int = Field(description="Return code")
    deal: int = Field(description="Deal ticket")
    order: int = Field(description="Order ticket")
    volume: float = Field(description="Deal volume")
    price: float = Field(description="Deal price")
    bid: float = Field(description="Current bid")
    ask: float = Field(description="Current ask")
    comment: str = Field(description="Server comment")
    request: dict = Field(description="Original request")


class CheckResult(BaseModel):
    retcode: int = Field(description="Return code")
    balance: float = Field(description="Balance after check")
    equity: float = Field(description="Equity after check")
    profit: float = Field(description="Floating profit")
    margin: float = Field(description="Margin required")
    margin_free: float = Field(description="Free margin")
    margin_level: float = Field(description="Margin level")
    comment: str = Field(description="Server comment")
    request: dict = Field(description="Original request")


class CalcMarginResponse(BaseModel):
    margin: float = Field(description="Required margin")


class CalcProfitResponse(BaseModel):
    profit: float = Field(description="Calculated profit")


class CopyRatesResponse(BaseModel):
    symbol: str = Field(description="Symbol name")
    timeframe: str = Field(description="Timeframe string")
    candles: list[Candle] = Field(description="OHLC candles")


class CopyTicksResponse(BaseModel):
    symbol: str = Field(description="Symbol name")
    ticks: list[Tick] = Field(description="Tick data")


class SymbolInfoFullResponse(BaseModel):
    info: dict = Field(description="Full symbol information")


class TerminalInfoResponse(BaseModel):
    info: dict = Field(description="Full terminal information")


class InitializeRequest(BaseModel):
    path: str | None = Field(default=None, description="Terminal executable path")
    login: int | None = Field(default=None, description="Account login")
    password: str | None = Field(default=None, description="Account password")
    server: str | None = Field(default=None, description="Trade server")
    timeout: int | None = Field(default=None, description="Connection timeout (ms)")
    portable: bool | None = Field(default=None, description="Portable mode")


class LoginRequest(BaseModel):
    login: int = Field(description="Account login")
    password: str | None = Field(default=None, description="Account password")
    server: str | None = Field(default=None, description="Trade server")
    timeout: int | None = Field(default=None, description="Connection timeout (ms)")


class SymbolSelectResponse(BaseModel):
    result: bool = Field(description="Operation result")


class MarketBookActionResponse(BaseModel):
    result: bool = Field(description="Operation result")


class InitializeResponse(BaseModel):
    result: bool = Field(description="Initialization result")


class LoginResponse(BaseModel):
    result: bool = Field(description="Login result")


class ShutdownResponse(BaseModel):
    result: bool = Field(description="Shutdown result")


class OrderCalcMarginRequest(BaseModel):
    action: int = Field(description="Trade operation type (ORDER_TYPE_*)")
    symbol: str = Field(description="Symbol name")
    volume: float = Field(description="Volume in lots")
    price: float = Field(description="Price")


class OrderCalcProfitRequest(BaseModel):
    action: int = Field(description="Trade operation type (ORDER_TYPE_*)")
    symbol: str = Field(description="Symbol name")
    volume: float = Field(description="Volume in lots")
    price: float = Field(description="Price")
    price_close: float = Field(description="Close price")


# ---------------------------------------------------------------------------
# Connection Management
# ---------------------------------------------------------------------------


@app.post("/initialize", response_model=InitializeResponse)
async def post_initialize(body: InitializeRequest):
    global _initialized
    try:
        kwargs = body.model_dump(exclude_none=True)
        result = _get_mt5().initialize(**kwargs)
        if result:
            _initialized = True
        return InitializeResponse(result=result)
    except Exception as e:
        logger.exception("Error initializing MT5")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/login", response_model=LoginResponse)
async def post_login(body: LoginRequest):
    if not _initialized:
        return JSONResponse(status_code=503, content={"error": "MT5 not initialized. Call /initialize first"})
    try:
        kwargs = body.model_dump(exclude_none=True)
        login_val = kwargs.pop("login")
        result = _get_mt5().login(login_val, **kwargs)
        return LoginResponse(result=result)
    except Exception as e:
        logger.exception("Error logging in")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/shutdown", response_model=ShutdownResponse)
async def post_shutdown():
    global _initialized
    if not _initialized:
        return ShutdownResponse(result=True)
    try:
        _get_mt5().shutdown()
        _initialized = False
        return ShutdownResponse(result=True)
    except Exception as e:
        logger.exception("Error shutting down MT5")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/version", response_model=VersionResponse)
async def get_version():
    try:
        ver = _get_mt5().version()
        if ver is None:
            return JSONResponse(status_code=503, content={"error": "Version info not available"})
        return VersionResponse(
            major=ver[0],
            minor=ver[1],
            build=ver[2],
            release_date=ver[3],
        )
    except Exception as e:
        logger.exception("Error fetching version")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/last-error", response_model=LastErrorResponse)
async def get_last_error():
    try:
        err = _get_mt5().last_error()
        return LastErrorResponse(code=err[0], description=err[1])
    except Exception as e:
        logger.exception("Error fetching last error")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ---------------------------------------------------------------------------
# Terminal & Account
# ---------------------------------------------------------------------------


@app.get("/terminal-info", response_model=TerminalInfoResponse)
async def get_terminal_info():
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        info = _get_mt5().terminal_info()
        if info is None:
            return JSONResponse(status_code=503, content={"error": "Terminal info not available"})
        return TerminalInfoResponse(info=_to_dict(info))
    except Exception as e:
        logger.exception("Error fetching terminal info")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ---------------------------------------------------------------------------
# Symbols
# ---------------------------------------------------------------------------


@app.get("/symbols-total", response_model=TotalResponse)
async def get_symbols_total():
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        total = _get_mt5().symbols_total()
        return TotalResponse(total=total)
    except Exception as e:
        logger.exception("Error fetching symbols total")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/symbol-info", response_model=SymbolInfoFullResponse)
async def get_symbol_info(symbol: str = Query(..., description="Symbol name")):
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        info = _get_mt5().symbol_info(symbol)
        if info is None:
            err = _get_mt5().last_error()
            return JSONResponse(
                status_code=404,
                content={"error": f"Symbol not found: {symbol}", "details": {"code": err[0], "description": err[1]}},
            )
        return SymbolInfoFullResponse(info=_to_dict(info))
    except Exception as e:
        logger.exception("Error fetching symbol info")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/symbol-select", response_model=SymbolSelectResponse)
async def post_symbol_select(body: SymbolSelectRequest):
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        result = _get_mt5().symbol_select(body.symbol, body.enable)
        return SymbolSelectResponse(result=result)
    except Exception as e:
        logger.exception("Error selecting symbol")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ---------------------------------------------------------------------------
# Market Depth
# ---------------------------------------------------------------------------


@app.post("/market-book-add", response_model=MarketBookActionResponse)
async def post_market_book_add(body: SymbolSelectRequest):
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        result = _get_mt5().market_book_add(body.symbol)
        return MarketBookActionResponse(result=result)
    except Exception as e:
        logger.exception("Error adding market book")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/market-book-get", response_model=MarketBookResponse)
async def get_market_book_get(symbol: str = Query(..., description="Symbol name")):
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        book = _get_mt5().market_book_get(symbol)
        if book is None:
            return JSONResponse(status_code=404, content={"error": f"Market book not available for {symbol}"})
        entries = [_to_dict(b) for b in book]
        return MarketBookResponse(symbol=symbol, book=entries)
    except Exception as e:
        logger.exception("Error fetching market book")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/market-book-release", response_model=MarketBookActionResponse)
async def post_market_book_release(body: SymbolSelectRequest):
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        result = _get_mt5().market_book_release(body.symbol)
        return MarketBookActionResponse(result=result)
    except Exception as e:
        logger.exception("Error releasing market book")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ---------------------------------------------------------------------------
# OHLC / Rates / Ticks
# ---------------------------------------------------------------------------


@app.get("/ohlc", response_model=OHLCResponse)
async def get_ohlc(
    symbol: str = Query(..., description="Symbol name, e.g. EURUSD"),
    timeframe: str = Query("M1", description="Timeframe: M1, M5, M15, H1, H4, D1"),
    count: int = Query(100, ge=1, le=1000, description="Number of candles"),
):
    if not _check_mt5():
        return _mt5_unavailable()

    tf = TIMEFRAME_MAP.get(timeframe.upper())
    if tf is None:
        return JSONResponse(
            status_code=400,
            content={"error": f"Invalid timeframe: {timeframe}. Use M1, M5, M15, H1, H4, D1"},
        )

    try:
        rates = _get_mt5().copy_rates_from_pos(symbol, tf, 0, count)
        if rates is None:
            err = _get_mt5().last_error()
            if err[0] == -1:
                return JSONResponse(
                    status_code=404,
                    content={"error": f"Symbol not found: {symbol}"},
                )
            return JSONResponse(
                status_code=503,
                content={"error": f"MT5 error: {err}"},
            )

        candles = [
            Candle(
                time=int(c[0]),
                open=c[1],
                high=c[2],
                low=c[3],
                close=c[4],
                tickVolume=c[5],
                spread=c[6],
                realVolume=c[7],
            )
            for c in rates
        ]

        return OHLCResponse(symbol=symbol, timeframe=timeframe, candles=candles)
    except Exception as e:
        logger.exception("Error fetching OHLC")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/copy-rates-from", response_model=CopyRatesResponse)
async def get_copy_rates_from(
    symbol: str = Query(..., description="Symbol name"),
    timeframe: str = Query(..., description="Timeframe: M1, M5, M15, H1, H4, D1"),
    date_from: int = Query(..., description="Start date (unix timestamp)"),
    count: int = Query(100, ge=1, le=100000, description="Number of candles"),
):
    if not _check_mt5():
        return _mt5_unavailable()

    tf = TIMEFRAME_MAP.get(timeframe.upper())
    if tf is None:
        return JSONResponse(
            status_code=400,
            content={"error": f"Invalid timeframe: {timeframe}. Use M1, M5, M15, H1, H4, D1"},
        )

    try:
        rates = _get_mt5().copy_rates_from(symbol, tf, date_from, count)
        if rates is None:
            err = _get_mt5().last_error()
            return JSONResponse(
                status_code=503,
                content={"error": f"MT5 error: {err}"},
            )

        candles = [
            Candle(
                time=int(c[0]),
                open=c[1],
                high=c[2],
                low=c[3],
                close=c[4],
                tickVolume=c[5],
                spread=c[6],
                realVolume=c[7],
            )
            for c in rates
        ]

        return CopyRatesResponse(symbol=symbol, timeframe=timeframe, candles=candles)
    except Exception as e:
        logger.exception("Error fetching copy-rates-from")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/copy-rates-range", response_model=CopyRatesResponse)
async def get_copy_rates_range(
    symbol: str = Query(..., description="Symbol name"),
    timeframe: str = Query(..., description="Timeframe: M1, M5, M15, H1, H4, D1"),
    date_from: int = Query(..., description="Start date (unix timestamp)"),
    date_to: int = Query(..., description="End date (unix timestamp)"),
):
    if not _check_mt5():
        return _mt5_unavailable()

    tf = TIMEFRAME_MAP.get(timeframe.upper())
    if tf is None:
        return JSONResponse(
            status_code=400,
            content={"error": f"Invalid timeframe: {timeframe}. Use M1, M5, M15, H1, H4, D1"},
        )

    try:
        rates = _get_mt5().copy_rates_range(symbol, tf, date_from, date_to)
        if rates is None:
            err = _get_mt5().last_error()
            return JSONResponse(
                status_code=503,
                content={"error": f"MT5 error: {err}"},
            )

        candles = [
            Candle(
                time=int(c[0]),
                open=c[1],
                high=c[2],
                low=c[3],
                close=c[4],
                tickVolume=c[5],
                spread=c[6],
                realVolume=c[7],
            )
            for c in rates
        ]

        return CopyRatesResponse(symbol=symbol, timeframe=timeframe, candles=candles)
    except Exception as e:
        logger.exception("Error fetching copy-rates-range")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/copy-ticks-from", response_model=CopyTicksResponse)
async def get_copy_ticks_from(
    symbol: str = Query(..., description="Symbol name"),
    date_from: int = Query(..., description="Start date (unix timestamp)"),
    count: int = Query(1000, ge=1, le=100000, description="Number of ticks"),
    flags: int = Query(0, description="Tick flags (COPY_TICKS_ALL=0, INFO=1, TRADE=2)"),
):
    if not _check_mt5():
        return _mt5_unavailable()

    try:
        ticks = _get_mt5().copy_ticks_from(symbol, date_from, count, flags)
        if ticks is None:
            err = _get_mt5().last_error()
            return JSONResponse(
                status_code=503,
                content={"error": f"MT5 error: {err}"},
            )

        result = [
            Tick(
                time=t[0],
                bid=t[1],
                ask=t[2],
                last=t[3],
                volume=t[4],
                time_msc=t[5],
                flags=t[6],
                volume_real=t[7],
            )
            for t in ticks
        ]

        return CopyTicksResponse(symbol=symbol, ticks=result)
    except Exception as e:
        logger.exception("Error fetching copy-ticks-from")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/copy-ticks-range", response_model=CopyTicksResponse)
async def get_copy_ticks_range(
    symbol: str = Query(..., description="Symbol name"),
    date_from: int = Query(..., description="Start date (unix timestamp)"),
    date_to: int = Query(..., description="End date (unix timestamp)"),
    flags: int = Query(0, description="Tick flags (COPY_TICKS_ALL=0, INFO=1, TRADE=2)"),
):
    if not _check_mt5():
        return _mt5_unavailable()

    try:
        ticks = _get_mt5().copy_ticks_range(symbol, date_from, date_to, flags)
        if ticks is None:
            err = _get_mt5().last_error()
            return JSONResponse(
                status_code=503,
                content={"error": f"MT5 error: {err}"},
            )

        result = [
            Tick(
                time=t[0],
                bid=t[1],
                ask=t[2],
                last=t[3],
                volume=t[4],
                time_msc=t[5],
                flags=t[6],
                volume_real=t[7],
            )
            for t in ticks
        ]

        return CopyTicksResponse(symbol=symbol, ticks=result)
    except Exception as e:
        logger.exception("Error fetching copy-ticks-range")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------


@app.get("/orders-total", response_model=TotalResponse)
async def get_orders_total():
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        total = _get_mt5().orders_total()
        return TotalResponse(total=total)
    except Exception as e:
        logger.exception("Error fetching orders total")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/orders-get", response_model=list[dict])
async def get_orders_get(
    symbol: str | None = Query(default=None, description="Filter by symbol"),
    group: str | None = Query(default=None, description="Filter by group pattern"),
    ticket: int | None = Query(default=None, description="Filter by ticket"),
):
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        kwargs = {}
        if symbol is not None:
            kwargs["symbol"] = symbol
        if group is not None:
            kwargs["group"] = group
        if ticket is not None:
            kwargs["ticket"] = ticket
        orders = _get_mt5().orders_get(**kwargs)
        if orders is None:
            return []
        return _to_dict(orders)
    except Exception as e:
        logger.exception("Error fetching orders")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/order-calc-margin", response_model=CalcMarginResponse)
async def post_order_calc_margin(body: OrderCalcMarginRequest):
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        margin = _get_mt5().order_calc_margin(body.action, body.symbol, body.volume, body.price)
        if margin is None:
            err = _get_mt5().last_error()
            return JSONResponse(
                status_code=503,
                content={"error": f"MT5 error: {err}"},
            )
        return CalcMarginResponse(margin=margin)
    except Exception as e:
        logger.exception("Error calculating margin")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/order-calc-profit", response_model=CalcProfitResponse)
async def post_order_calc_profit(body: OrderCalcProfitRequest):
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        profit = _get_mt5().order_calc_profit(body.action, body.symbol, body.volume, body.price, body.price_close)
        if profit is None:
            err = _get_mt5().last_error()
            return JSONResponse(
                status_code=503,
                content={"error": f"MT5 error: {err}"},
            )
        return CalcProfitResponse(profit=profit)
    except Exception as e:
        logger.exception("Error calculating profit")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/order-check", response_model=CheckResult)
async def post_order_check(body: TradeRequest):
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        request_dict = body.model_dump()
        result = _get_mt5().order_check(request_dict)
        if result is None:
            err = _get_mt5().last_error()
            return JSONResponse(
                status_code=503,
                content={"error": f"MT5 error: {err}"},
            )
        data = _to_dict(result)
        return CheckResult(**data)
    except Exception as e:
        logger.exception("Error checking order")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/order-send", response_model=TradeResult)
async def post_order_send(body: TradeRequest):
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        request_dict = body.model_dump()
        result = _get_mt5().order_send(request_dict)
        if result is None:
            err = _get_mt5().last_error()
            return JSONResponse(
                status_code=503,
                content={"error": f"MT5 error: {err}"},
            )
        data = _to_dict(result)
        return TradeResult(**data)
    except Exception as e:
        logger.exception("Error sending order")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ---------------------------------------------------------------------------
# Positions
# ---------------------------------------------------------------------------


@app.get("/positions-total", response_model=TotalResponse)
async def get_positions_total():
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        total = _get_mt5().positions_total()
        return TotalResponse(total=total)
    except Exception as e:
        logger.exception("Error fetching positions total")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/positions-get", response_model=list[dict])
async def get_positions_get(
    symbol: str | None = Query(default=None, description="Filter by symbol"),
    group: str | None = Query(default=None, description="Filter by group pattern"),
    ticket: int | None = Query(default=None, description="Filter by ticket"),
):
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        kwargs = {}
        if symbol is not None:
            kwargs["symbol"] = symbol
        if group is not None:
            kwargs["group"] = group
        if ticket is not None:
            kwargs["ticket"] = ticket
        positions = _get_mt5().positions_get(**kwargs)
        if positions is None:
            return []
        return _to_dict(positions)
    except Exception as e:
        logger.exception("Error fetching positions")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


@app.get("/history-orders-total", response_model=TotalResponse)
async def get_history_orders_total(
    date_from: int = Query(..., description="Start date (unix timestamp)"),
    date_to: int = Query(..., description="End date (unix timestamp)"),
):
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        total = _get_mt5().history_orders_total(date_from, date_to)
        return TotalResponse(total=total)
    except Exception as e:
        logger.exception("Error fetching history orders total")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/history-orders-get", response_model=list[dict])
async def get_history_orders_get(
    date_from: int = Query(..., description="Start date (unix timestamp)"),
    date_to: int = Query(..., description="End date (unix timestamp)"),
    group: str | None = Query(default=None, description="Filter by group pattern"),
    ticket: int | None = Query(default=None, description="Filter by ticket"),
):
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        kwargs = {"date_from": date_from, "date_to": date_to}
        if group is not None:
            kwargs["group"] = group
        if ticket is not None:
            kwargs["ticket"] = ticket
        orders = _get_mt5().history_orders_get(**kwargs)
        if orders is None:
            return []
        return _to_dict(orders)
    except Exception as e:
        logger.exception("Error fetching history orders")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/history-deals-total", response_model=TotalResponse)
async def get_history_deals_total(
    date_from: int = Query(..., description="Start date (unix timestamp)"),
    date_to: int = Query(..., description="End date (unix timestamp)"),
):
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        total = _get_mt5().history_deals_total(date_from, date_to)
        return TotalResponse(total=total)
    except Exception as e:
        logger.exception("Error fetching history deals total")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/history-deals-get", response_model=list[dict])
async def get_history_deals_get(
    date_from: int = Query(..., description="Start date (unix timestamp)"),
    date_to: int = Query(..., description="End date (unix timestamp)"),
    group: str | None = Query(default=None, description="Filter by group pattern"),
    ticket: int | None = Query(default=None, description="Filter by ticket"),
):
    if not _check_mt5():
        return _mt5_unavailable()
    try:
        kwargs = {"date_from": date_from, "date_to": date_to}
        if group is not None:
            kwargs["group"] = group
        if ticket is not None:
            kwargs["ticket"] = ticket
        deals = _get_mt5().history_deals_get(**kwargs)
        if deals is None:
            return []
        return _to_dict(deals)
    except Exception as e:
        logger.exception("Error fetching history deals")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ---------------------------------------------------------------------------
# Existing / Re-organized endpoints
# ---------------------------------------------------------------------------


@app.get("/trades", response_model=TradesResponse)
async def get_trades():
    if not _check_mt5():
        return _mt5_unavailable()

    try:
        positions_raw = _get_mt5().positions_get()
        orders_raw = _get_mt5().orders_get()

        positions = []
        if positions_raw is not None:
            for p in positions_raw:
                positions.append(Position(
                    ticket=p.ticket,
                    symbol=p.symbol,
                    type="buy" if p.type == 0 else "sell",
                    volume=p.volume,
                    priceOpen=p.price_open,
                    priceCurrent=p.price_current,
                    profit=p.profit,
                    swap=p.swap,
                    commission=p.commission,
                    sl=p.sl,
                    tp=p.tp,
                    openTime=int(p.time),
                    comment=p.comment or "",
                ))

        orders = []
        if orders_raw is not None:
            for o in orders_raw:
                orders.append(Order(
                    ticket=o.ticket,
                    symbol=o.symbol,
                    type=_get_mt5().ORDER_TYPE_DESCRIPTION.get(o.type, str(o.type)),
                    volume=o.volume_current,
                    price=o.price_open,
                    sl=o.sl,
                    tp=o.tp,
                    openTime=int(o.time_setup),
                    comment=o.comment or "",
                    magic=o.magic,
                ))

        return TradesResponse(positions=positions, orders=orders)
    except Exception as e:
        logger.exception("Error fetching trades")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/account", response_model=AccountResponse)
async def get_account():
    if not _check_mt5():
        return _mt5_unavailable()

    try:
        info = _get_mt5().account_info()
        if info is None:
            return JSONResponse(status_code=503, content={"error": "Account info not available"})

        return AccountResponse(
            login=info.login,
            balance=info.balance,
            equity=info.equity,
            margin=info.margin,
            marginFree=info.margin_free,
            profit=info.profit,
            leverage=info.leverage,
            server=info.server or "",
            currency=info.currency or "",
            name=info.name or "",
            tradeMode=info.trade_mode,
            marginLevel=info.margin_level,
        )
    except Exception as e:
        logger.exception("Error fetching account info")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/history", response_model=HistoryResponse)
async def get_history(
    from_time: int = Query(
        default=None,
        alias="from",
        description="Start time (unix seconds). Defaults to 24 hours ago.",
    ),
    to: int = Query(
        default=None,
        description="End time (unix seconds). Defaults to now.",
    ),
):
    if not _check_mt5():
        return _mt5_unavailable()

    now_ts = int(datetime.now(timezone.utc).timestamp())
    if from_time is None:
        from_time = now_ts - 86400
    if to is None:
        to = now_ts

    try:
        deals_raw = _get_mt5().history_deals_get(from_time, to)
        orders_raw = _get_mt5().history_orders_get(from_time, to)

        deals = []
        if deals_raw is not None:
            for d in deals_raw:
                deal_type = d.type
                if deal_type == 0:
                    type_str = "buy"
                elif deal_type == 1:
                    type_str = "sell"
                else:
                    type_str = _get_mt5().DEAL_TYPE_DESCRIPTION.get(deal_type, str(deal_type))

                deals.append(HistoryDeal(
                    ticket=d.ticket,
                    symbol=d.symbol,
                    type=type_str,
                    volume=d.volume,
                    price=d.price,
                    profit=d.profit,
                    commission=d.commission,
                    swap=d.swap,
                    time=int(d.time),
                    comment=d.comment or "",
                    magic=d.magic,
                ))

        orders = []
        if orders_raw is not None:
            for o in orders_raw:
                orders.append(HistoryOrder(
                    ticket=o.ticket,
                    symbol=o.symbol,
                    type=_get_mt5().ORDER_TYPE_DESCRIPTION.get(o.type, str(o.type)),
                    volume=o.volume_current,
                    price=o.price_open,
                    sl=o.sl,
                    tp=o.tp,
                    time=int(o.time_setup),
                    comment=o.comment or "",
                    magic=o.magic,
                ))

        return HistoryResponse(deals=deals, orders=orders)
    except Exception as e:
        logger.exception("Error fetching history")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/symbols", response_model=SymbolsResponse)
async def get_symbols():
    if not _check_mt5():
        return _mt5_unavailable()

    try:
        symbols_raw = _get_mt5().symbols_get()
        if symbols_raw is None:
            return JSONResponse(status_code=503, content={"error": "Symbols not available"})

        symbols = []
        for s in symbols_raw:
            tick = _get_mt5().symbol_info_tick(s.name)
            bid = tick.bid if tick else 0.0
            ask = tick.ask if tick else 0.0
            spread = int((ask - bid) * (10 ** s.digits)) if tick and bid and ask else 0

            symbols.append(SymbolInfo(
                name=s.name,
                bid=bid,
                ask=ask,
                spread=spread,
                digits=s.digits,
                tradeMode=s.trade_mode,
                volumeMin=s.volume_min,
                volumeMax=s.volume_max,
                volumeStep=s.volume_step,
            ))

        return SymbolsResponse(symbols=symbols)
    except Exception as e:
        logger.exception("Error fetching symbols")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/")
async def get_root():
    return {
        "service": "MT5 Bridge API",
        "version": "1.0.0",
        "endpoints": {
            "GET /": "This help message",
            "GET /health": "Health check (status, mt5, terminal, account)",
            "GET /version": "MT5 version info",
            "GET /last-error": "Last MT5 error code and description",
            "GET /terminal-info": "Terminal information",
            "GET /account": "Account info (login, balance, equity, margin, etc.)",
            "GET /symbols": "All available symbols with bid/ask",
            "GET /symbols-total": "Total symbol count",
            "GET /symbol-info": "Symbol info (query: symbol)",
            "POST /symbol-select": "Enable/disable a symbol",
            "GET /ohlc": "OHLC candles (query: symbol, timeframe, count)",
            "GET /copy-rates-from": "Historical rates from date",
            "GET /copy-rates-range": "Historical rates in range",
            "GET /copy-ticks-from": "Historical ticks from date",
            "GET /copy-ticks-range": "Historical ticks in range",
            "GET /trades": "Open positions and pending orders",
            "GET /positions-total": "Total open positions count",
            "GET /positions-get": "Open positions (filterable)",
            "GET /orders-total": "Total pending orders count",
            "GET /orders-get": "Pending orders (filterable)",
            "GET /history": "Deals and order history",
            "GET /history-deals-total": "Deal count in date range",
            "GET /history-deals-get": "Deals in date range (filterable)",
            "GET /history-orders-total": "Historical order count in date range",
            "GET /history-orders-get": "Historical orders in date range (filterable)",
            "POST /order-check": "Validate a trade request",
            "POST /order-send": "Execute a trade request",
            "POST /order-calc-margin": "Calculate margin for a trade",
            "POST /order-calc-profit": "Calculate profit for a trade",
            "POST /market-book-add": "Subscribe to market depth",
            "GET /market-book-get": "Get market depth",
            "POST /market-book-release": "Unsubscribe from market depth",
            "POST /initialize": "Initialize MT5 connection",
            "POST /login": "Login to a trading account",
            "POST /shutdown": "Shutdown MT5 connection",
            "POST /sync/pull": "Pull config sets from MinIO",
            "POST /sync/bootstrap": "Bootstrap config from env",
            "GET /sync/status": "Sync status",
        },
        "status": "degraded" if not _initialized else "ok",
        "docs": "/docs",
        "openapi": "/openapi.json",
    }


@app.get("/health", response_model=HealthResponse)
async def get_health():
    mt5_status = "disconnected"
    terminal_status = "not running"
    account_login = None

    if _initialized:
        mt5_status = "connected"
        try:
            term = _get_mt5().terminal_info()
            terminal_status = "running" if term is not None else "not running"
        except Exception:
            terminal_status = "not running"

        try:
            acc = _get_mt5().account_info()
            if acc is not None:
                account_login = acc.login
        except Exception:
            pass

    overall = "ok" if mt5_status == "connected" and terminal_status == "running" else "degraded"

    return HealthResponse(
        status=overall,
        mt5=mt5_status,
        terminal=terminal_status,
        account=account_login,
    )


@app.post("/sync/pull")
async def sync_pull(body: dict = {}):
    """Pull config sets from MinIO and apply to MT5 directory."""
    import subprocess
    import os
    
    config_sets = body.get("configSets", [])
    results = []
    mt5_dir = os.environ.get("MT5_DIR", "/config/.wine/drive_c/Program Files/MetaTrader 5")
    endpoint = os.environ.get("MINIO_ENDPOINT", "minio:9000")
    bucket = os.environ.get("MINIO_BUCKET", "mt5-configs")
    
    for cs in config_sets:
        try:
            set_id = cs.get("id")
            version = cs.get("version", "current")
            set_type = cs.get("setType", "full")
            
            # Map set type to target directory
            type_paths = {
                "charts": "Profiles/Charts",
                "templates": "Profiles/Templates",
                "symbolsets": "Profiles/SymbolSets",
                "mql5-experts": "MQL5/Experts",
                "mql5-indicators": "MQL5/Indicators",
                "mql5-include": "MQL5/Include",
                "mql5-scripts": "MQL5/Scripts",
                "mql5-libraries": "MQL5/Libraries",
                "full": "",
            }
            
            # Download from MinIO using HTTP API (no extra deps)
            import urllib.request
            
            # For simplicity, list objects via API
            list_url = f"http://{endpoint}/{bucket}/?prefix=config-sets/{set_id}/v{version}/&list-type=2"
            
            try:
                with urllib.request.urlopen(list_url, timeout=10) as resp:
                    list_xml = resp.read().decode()
                    # Parse XML to get object keys
                    import xml.etree.ElementTree as ET
                    root = ET.fromstring(list_xml)
                    ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
                    keys = []
                    for content in root.findall(".//s3:Content", ns):
                        key_el = content.find("s3:Key", ns)
                        if key_el is not None and key_el.text:
                            keys.append(key_el.text)
                    
                    files_written = 0
                    for key in keys:
                        # Download each file
                        file_url = f"http://{endpoint}/{bucket}/{key}"
                        rel_path = key.split(f"v{version}/", 1)[-1] if f"v{version}/" in key else key
                        
                        # Determine target path based on set type
                        if set_type == "full":
                            target_path = os.path.join(mt5_dir, rel_path)
                        else:
                            target_dir = type_paths.get(set_type, "")
                            target_path = os.path.join(mt5_dir, target_dir, rel_path)
                        
                        os.makedirs(os.path.dirname(target_path), exist_ok=True)
                        try:
                            urllib.request.urlretrieve(file_url, target_path)
                            files_written += 1
                        except Exception as dl_err:
                            logger.warning(f"Failed to download {file_url}: {dl_err}")
                    
                    results.append({"setId": set_id, "status": "ok", "filesWritten": files_written})
            except Exception as api_err:
                logger.warning(f"MinIO API error: {api_err}")
                results.append({"setId": set_id, "status": "error", "error": str(api_err)})
        except Exception as e:
            results.append({"setId": cs.get("id"), "status": "error", "error": str(e)})
    
    # Restart MT5 terminal to pick up changes
    try:
        subprocess.run(["pkill", "-f", "terminal64.exe"], timeout=5)
        logger.info("MT5 terminal killed for restart")
    except Exception:
        pass
    
    return {"status": "ok", "results": results}


@app.post("/sync/bootstrap")
async def sync_bootstrap(body: dict = {}):
    """Bootstrap sync on first boot. Pulls assigned config sets from env vars."""
    import os
    config_set_ids = os.environ.get("CONFIG_SET_IDS", "")
    if not config_set_ids:
        return {"status": "ok", "results": []}
    
    ids = [int(x.strip()) for x in config_set_ids.split(",") if x.strip()]
    config_sets = [{"id": sid, "version": "current", "setType": "full"} for sid in ids]
    
    # Reuse sync_pull logic
    import subprocess
    import urllib.request
    import xml.etree.ElementTree as ET
    
    mt5_dir = os.environ.get("MT5_DIR", "/config/.wine/drive_c/Program Files/MetaTrader 5")
    endpoint = os.environ.get("MINIO_ENDPOINT", "minio:9000")
    bucket = os.environ.get("MINIO_BUCKET", "mt5-configs")
    results = []
    
    for cs in config_sets:
        try:
            set_id = cs["id"]
            list_url = f"http://{endpoint}/{bucket}/?prefix=config-sets/{set_id}/&list-type=2"
            
            with urllib.request.urlopen(list_url, timeout=10) as resp:
                list_xml = resp.read().decode()
                root = ET.fromstring(list_xml)
                ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
                keys = []
                for content in root.findall(".//s3:Content", ns):
                    key_el = content.find("s3:Key", ns)
                    if key_el is not None and key_el.text:
                        keys.append(key_el.text)
                
                # Find the latest version
                versions = set()
                for k in keys:
                    m = k.split("v")[-1].split("/")[0] if "v" in k else None
                    if m and m.isdigit():
                        versions.add(int(m))
                
                latest = max(versions) if versions else 1
                files_written = 0
                
                prefix = f"config-sets/{set_id}/v{latest}/"
                for key in keys:
                    if not key.startswith(prefix):
                        continue
                    rel_path = key[len(prefix):]
                    target_path = os.path.join(mt5_dir, rel_path)
                    os.makedirs(os.path.dirname(target_path), exist_ok=True)
                    file_url = f"http://{endpoint}/{bucket}/{key}"
                    try:
                        urllib.request.urlretrieve(file_url, target_path)
                        files_written += 1
                    except Exception:
                        pass
                
                results.append({"setId": set_id, "version": latest, "status": "ok", "filesWritten": files_written})
        except Exception as e:
            results.append({"setId": cs["id"], "status": "error", "error": str(e)})
    
    return {"status": "ok", "results": results}


@app.get("/sync/status")
async def sync_status():
    """Return current sync status."""
    import os
    config_set_ids = os.environ.get("CONFIG_SET_IDS", "")
    ids = [int(x.strip()) for x in config_set_ids.split(",") if x.strip()] if config_set_ids else []
    return {
        "lastSyncAt": None,  # Could track in a file
        "deployedSets": [],
        "assignedSetIds": ids,
        "minioEndpoint": os.environ.get("MINIO_ENDPOINT", ""),
    }


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090)
