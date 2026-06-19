# yebichu MetaTrader 5 Algo Trading — Setup Guide

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Docker Container (yebichu-metatrader5-algotrading)        │
│                                                          │
│  ┌────────────┐    rpyc TCP:18812    ┌────────────────┐  │
│  │ Wine Python │◄────────────────────┤ Linux Python    │  │
│  │ MetaTrader5 │                     │ FastAPI Bridge  │  │
│  │ module      │                     │ (uvicorn :8090) │  │
│  └──────┬──────┘                     └────────┬───────┘  │
│         │ MT5 terminal                        │          │
│  ┌──────┴──────┐                     HTTP API │          │
│  │ terminal64  │                     :8090    │          │
│  │ (Wine)      │                     :32776   │          │
│  └─────────────┘                     (host)   │          │
│         │                                     │          │
│  ┌──────┴──────┐                               │          │
│  │ Xvnc :5901  │                               │          │
│  │ Xfce4 - no  │                               │          │
│  │ panel       │                               │          │
│  └─────────────┘                               │          │
└──────────────────────────────────────────────────────────┘
```

## Building the Image

From the project root:

```bash
# Using the build script:
./runtime/build.sh

# With a custom tag:
./runtime/build.sh v1.2.0

# Or manually:
docker build -f runtime/Dockerfile -t yebichu-metatrader5-algotrading:latest .
```

## Running the Container

### Quick start (single instance)

```bash
docker run -d \
  --name mt5-instance \
  --cap-add SYS_PTRACE \
  --security-opt seccomp=unconfined \
  -p 5901:5901 \
  -p 6080:6080 \
  -p 8090:8090 \
  -e PASSWORD=changeme \
  -e INSTANCE_NAME=my-mt5 \
  -e ENABLE_API=true \
  -v mt5-wine:/config/.wine \
  -v mt5-shared:/mt5-shared \
  -v mt5-instance-data:/mt5-instance \
  yebichu-metatrader5-algotrading:latest
```

### With volume mounts (production)

Create the required directories:

```bash
mkdir -p /data/mt5/instances/my-account/wine
mkdir -p /data/mt5/instances/my-account/data
mkdir -p /data/mt5/shared/MetaTrader\ 5
```

Run with bind mounts:

```bash
docker run -d \
  --name mt5-my-account \
  --cap-add SYS_PTRACE \
  --security-opt seccomp=unconfined \
  -p 5901:5901 \
  -p 8090:8090 \
  -e INSTANCE_NAME=my-account \
  -e ENABLE_API=true \
  -v /data/mt5/instances/my-account/wine:/config/.wine \
  -v /data/mt5/shared:/mt5-shared \
  -v /data/mt5/instances/my-account/data:/mt5-instance \
  yebichu-metatrader5-algotrading:latest
```

## Volume Structure

| Mount point | Purpose | Persists |
|---|---|---|
| `/config/.wine` | Wine prefix (MT5 config, login state, profiles) | Yes |
| `/mt5-shared/MetaTrader 5` | Shared MT5 files (EA scripts, indicators, etc.) | Yes |
| `/mt5-instance` | Instance-specific overrides (Config, Bases, Tester, MQL5/Files, MQL5/logs) | Yes |

The entrypoint auto-creates symlinks from the shared directory into the Wine prefix, with instance-specific overrides taking precedence.

## Account Configuration via Volume Swapping

To run multiple MT5 accounts, create separate volume sets and swap them:

```bash
# Account 1
docker run -d --name mt5-acc1 \
  -v /data/mt5/acc1/wine:/config/.wine \
  -v /data/mt5/shared:/mt5-shared \
  -v /data/mt5/acc1/data:/mt5-instance \
  yebichu-metatrader5-algotrading:latest

# Account 2 (same image, different volumes)
docker run -d --name mt5-acc2 \
  -v /data/mt5/acc2/wine:/config/.wine \
  -v /data/mt5/shared:/mt5-shared \
  -v /data/mt5/acc2/data:/mt5-instance \
  yebichu-metatrader5-algotrading:latest
```

The Wine prefix stores MT5 login credentials and terminal configuration. Just swap the `/config/.wine` volume to switch accounts.

## Management Mode vs Regular Instance

### Regular Instance (default)

Shares MQL5 code and Profiles via symlinks to `/mt5-shared/MetaTrader 5`. Instance-specific overrides in `/mt5-instance` take precedence. Use this for running trading bots where you want centralized EA management.

### Management Instance

Set `MANAGEMENT_MODE=true` to create an isolated workspace. The entrypoint converts shared symlinks into real directories and seeds initial data from the shared volume. Use this for configuring MT5, editing profiles, or setting up EAs without affecting regular instances.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `INSTANCE_NAME` | `mt5` | Instance identifier for log messages |
| `MANAGEMENT_MODE` | `false` | Enable management instance mode (isolated workspace) |
| `PASSWORD` | `changeme` | VNC password (not currently used — no auth) |
| `VNC_GEOMETRY` | `1280x720` | Screen resolution for VNC |
| `ENABLE_API` | `true` | Start rpyc server + FastAPI bridge on port 8090 |
| `ENABLE_FILEBROWSER` | `false` | Start Filebrowser web UI on port 8080 |
| `MT5_DIR` | `/config/.wine/drive_c/Program Files/MetaTrader 5` | MT5 install path inside Wine prefix |

## Exposed Ports

| Port | Service |
|---|---|
| 5901 | VNC (TigerVNC) |
| 6080 | Web VNC (websockify) |
| 8080 | Filebrowser (file manager) |
| 8090 | MT5 Bridge API (FastAPI + uvicorn) |

## API Endpoints

Once running, the bridge exposes a REST API on port 8090:

```
GET  /health          — Connection status
GET  /account         — Account info (balance, equity, etc.)
GET  /trades          — Open positions and pending orders
GET  /history         — Historical deals and orders
GET  /symbols         — Available symbols with current prices
GET  /ohlc            — OHLC candles
POST /order-send      — Send trading order
POST /order-check     — Validate order before sending
...                   (see OpenAPI docs at /docs)
```

## Verification

```bash
# Check container is running
docker ps | grep yebichu

# Health check via API
curl http://localhost:8090/health

# Expected output:
# { "status": "ok", "mt5": "connected", "terminal": "running", "account": <login> }

# Start MT5 via desktop shortcut (VNC required):
# Open VNC client to localhost:5901, double-click "MetaTrader 5" icon
```

## Build-time Caching

The Docker image uses several caching strategies:

- **Layer 1 (apt):** Cached until apt package list changes
- **Layer 3 (Wine):** Cached until Wine version changes
- **Layer 4 (installers):** Cached until MT5/Python version changes
- **Layer 4.5 (pre-install):** Cached until any build dependency changes
- **Layer 8 (entrypoint):** Changes most frequently — all prior layers cached

The MT5 installer and Python installer are retained in `/tmp/` inside the image so that fresh containers on swapped volumes can install without re-downloading.

## Common Issues

| Symptom | Cause | Fix |
|---|---|---|
| Bridge health: "degraded" | MT5 not running or not initialized | Launch MT5 from desktop shortcut |
| rpyc: "no module named rpyc" | rpyc not installed under Wine | `wine python -m pip install "rpyc>=6.0.0"` |
| rpyc: "config keyword argument" | rpyc version mismatch (5.x vs 6.x) | Match versions to 6.x on both sides |
| Bridge port in use | Old process lingering | `fuser -k 8090/tcp` |
| numpy._core not found | numpy version mismatch (1.x vs 2.x) | Upgrade Linux numpy to 2.x |
| Container exits immediately | Xvnc or dbus failed | Check logs: `docker logs <container>` |
