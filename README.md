# MT5 Manager

Container management platform for MetaTrader 5 instances. Manages the full lifecycle of Docker-based MT5 containers with VNC remote desktop access, API monitoring, and file browser integration.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     MT5 Manager                          │
│                                                          │
│  ┌──────────────┐     ┌──────────────┐                  │
│  │   Web UI      │────▶│  Manager API │                 │
│  │  (Vite+React) │     │  (Bun+Hono)  │                 │
│  └──────────────┘     └──────┬───────┘                  │
│                              │                           │
│                     ┌────────▼────────┐                 │
│                     │  Docker Engine  │                  │
│                     │  (via socket)   │                  │
│                     └────────┬────────┘                 │
│                              │                           │
│         ┌────────────────────┼────────────────────┐     │
│         ▼                    ▼                    ▼     │
│  ┌──────────┐         ┌──────────┐         ┌──────────┐│
│  │ MT5-inst │         │ MT5-inst │   ...   │ MT5-inst ││
│  │  (VNC)   │         │  (VNC)   │         │  (VNC)   ││
│  └──────────┘         └──────────┘         └──────────┘│
└─────────────────────────────────────────────────────────┘
```

- **Manager API** — Bun + Hono server managing Docker containers, system monitoring, VNC WebSocket tunnel
- **Container Runtime** — Docker images based on `mt5-tigervnc` with TigerVNC + noVNC + MT5 + optional filebrowser
- **Web UI** — Vite + React SPA with TanStack Query, react-router-dom, react-vnc viewer

## Quick Start

### Prerequisites
- [Bun](https://bun.sh) >= 1.0
- [Docker](https://docker.com) with Compose plugin
- Node.js 18+ (for Web UI development)

### Manager API
```bash
# Install dependencies
bun install

# Start the API server
bun run dev
# OR
bun src/index.ts

# The API listens on port 3001 by default
```

### Web UI
```bash
cd webui

# Install dependencies
bun install

# Start dev server
bun run dev

# The UI runs on http://localhost:3556
# API requests are proxied to http://localhost:3030
```

### Docker Deployment (Full Stack)
```bash
# Build the manager image
docker compose build

# Start the stack
docker compose up -d
```

### Build Runtime Image
```bash
cd runtime
docker build -t mt5-tigervnc .
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api` | List all available endpoints |
| GET | `/api/instances` | List all MT5 instances |
| GET | `/api/instances/:name` | Get instance details |
| POST | `/api/instances/:name/start` | Start an instance |
| POST | `/api/instances/:name/stop` | Stop an instance |
| POST | `/api/instances/:name/restart` | Restart an instance |
| GET | `/api/instances/:name/logs?tail=100` | Get container logs |
| GET | `/api/instances/:name/vnc` | Get VNC connection info |
| GET | `/api/system` | System resource metrics |
| WS | `/api/vnc/:name` | WebSocket VNC tunnel |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API server port |
| `HOST` | `unknown` | Public hostname for VNC URLs |
| `HOST_IP` | `127.0.0.1` | Public IP for VNC URLs |
| `INSTANCES_DIR` | `/root/mt5/instances` | Instance data directory |
| `SHARED_DIR` | `/root/mt5/shared` | Shared mount directory |
| `ENV_FILE` | `/root/mt5/.env` | Password env file |
| `HOST_PROC` | `/host/proc` | Host proc mount for system stats |
| `PASSWORD` | `changeme` | VNC password (in env file) |

## Project Structure

```
mt5-manager/
├── docker-compose.yaml    # Manager deployment
├── Dockerfile             # Manager image build
├── package.json           # Bun dependencies (Hono, docker-cli-js)
├── tsconfig.json          # TypeScript config
├── src/
│   ├── index.ts           # Server entry, WebSocket VNC tunnel
│   ├── routes/
│   │   ├── instances.ts   # Instance CRUD routes
│   │   └── system.ts      # System monitoring routes
│   └── lib/
│       ├── docker.ts      # Docker CLI wrappers
│       ├── instances.ts   # Instance lifecycle (legacy)
│       └── system.ts      # CPU/memory/disk monitoring
├── runtime/               # MT5 container image
│   ├── Dockerfile         # mt5-tigervnc image
│   ├── entrypoint.sh      # Container startup
│   ├── docker-compose.yaml
│   └── scripts/           # MT5 setup scripts
└── webui/                 # React frontend
    ├── package.json       # Vite + React + TanStack Query
    ├── vite.config.ts     # Vite config with API proxy
    ├── index.html         # Entry HTML
    └── src/
        ├── main.tsx       # App bootstrap
        ├── App.tsx        # Routes
        ├── index.css      # Global styles
        ├── api/
        │   ├── client.ts  # Axios instance
        │   ├── keys.ts    # TanStack Query keys
        │   └── mt5-proxy.ts  # Optional Hono auth proxy (reference)
        ├── hooks/         # TanStack Query hooks
        ├── components/    # UI components
        │   ├── VncViewer.tsx
        │   └── LiveLogs.tsx
        └── pages/
            ├── InstancesPage.tsx
            └── InstanceDetailPage.tsx
```
