#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/mihailnica10/yebichu-manager.git"
INSTALL_DIR="/opt/mt5-manager"
DATA_DIR="/var/lib/mt5"
INSTANCES_DIR="${DATA_DIR}/instances"
SHARED_DIR="${DATA_DIR}/shared"
MINIO_DIR="${DATA_DIR}/minio"
DB_PATH="${DATA_DIR}/mt5.db"
SOCKET_PORT="3557"
WEB_PORT="3556"
BUN_VERSION="1.3.14"
SOCKET_SECRET="$(tr -dc 'a-f0-9' < /dev/urandom | head -c 32)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }

detect_distro() {
  if command -v apt &>/dev/null; then
    echo "apt"
  elif command -v dnf &>/dev/null; then
    echo "dnf"
  elif command -v pacman &>/dev/null; then
    echo "pacman"
  else
    err "Unsupported package manager. Use apt, dnf, or pacman."
    exit 1
  fi
}

install_docker() {
  if command -v docker &>/dev/null; then
    log "Docker already installed ($(docker --version))"
    return
  fi

  warn "Docker not found. Installing..."
  local pm; pm=$(detect_distro)

  case "$pm" in
    apt)
      apt-get update -qq
      apt-get install -y -qq ca-certificates curl
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
      chmod a+r /etc/apt/keyrings/docker.asc
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
        > /etc/apt/sources.list.d/docker.list
      apt-get update -qq
      apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
      ;;
    dnf)
      dnf install -y dnf-plugins-core
      dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
      dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
      ;;
    pacman)
      pacman -Sy --noconfirm docker docker-compose
      ;;
  esac

  systemctl enable docker --now
  log "Docker installed"
}

install_bun() {
  if command -v bun &>/dev/null; then
    log "Bun already installed ($(bun --version))"
    return
  fi

  warn "Bun not found. Installing..."
  curl -fsSL https://bun.sh/install | bash -s -- -y
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"

  # Persist for root
  if [ "$HOME" = "/root" ]; then
    grep -q "BUN_INSTALL" /root/.bashrc 2>/dev/null || {
      echo 'export BUN_INSTALL="$HOME/.bun"' >> /root/.bashrc
      echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> /root/.bashrc
    }
  fi
  log "Bun installed ($(bun --version))"
}

setup_directories() {
  mkdir -p "$INSTANCES_DIR" "$SHARED_DIR" "$MINIO_DIR" "$DATA_DIR"
  log "Data directories created"
}

clone_project() {
  if [ -d "$INSTALL_DIR/.git" ]; then
    log "Project already cloned, pulling latest..."
    cd "$INSTALL_DIR" && git pull
  else
    warn "Cloning project..."
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  cd "$INSTALL_DIR"
  log "Project at $INSTALL_DIR ($(git log --oneline -1))"
}

build_docker_image() {
  local img; img="mt5-tigervnc:latest"
  if docker image inspect "$img" &>/dev/null; then
    log "Docker image $img already exists"
    return
  fi

  warn "Building Docker image $img (this takes 10-15 minutes)..."
  cd "$INSTALL_DIR/runtime"
  docker build -t "$img" .
  log "Docker image built"
}

start_minio() {
  if docker ps --format '{{.Names}}' | grep -q "^mt5-minio$"; then
    log "MinIO already running"
    return
  fi

  if docker ps -a --format '{{.Names}}' | grep -q "^mt5-minio$"; then
    docker start mt5-minio
    log "MinIO container started"
    return
  fi

  docker run -d \
    --name mt5-minio \
    --restart unless-stopped \
    -p 9000:9000 -p 9001:9001 \
    -e MINIO_ROOT_USER=minioadmin \
    -e MINIO_ROOT_PASSWORD=minioadmin \
    -v "${MINIO_DIR}:/data" \
    minio/minio:latest \
    server /data --console-address ":9001"

  # Wait for MinIO to be ready
  for i in $(seq 1 15); do
    if curl -s http://localhost:9000/minio/health/live &>/dev/null; then
      log "MinIO ready on port 9000"
      break
    fi
    sleep 2
  done

  # Create bucket
  docker run --rm --network host \
    -e MINIO_ROOT_USER=minioadmin \
    -e MINIO_ROOT_PASSWORD=minioadmin \
    minio/mc:latest \
    /bin/sh -c "mc alias set myminio http://localhost:9000 minioadmin minioadmin && mc mb myminio/mt5-configs --ignore-existing"
  log "MinIO bucket created"
}

install_mt5() {
  local mt5_dir="${SHARED_DIR}/MetaTrader 5"
  if [ -f "${mt5_dir}/terminal64.exe" ]; then
    log "MT5 already installed in shared directory"
    return
  fi

  warn "MetaTrader 5 not found. Downloading and installing..."

  # Create a temporary container to install MT5 via Wine
  local tmp_container="mt5-installer-$$"
  docker rm -f "$tmp_container" 2>/dev/null || true

  docker run -d \
    --name "$tmp_container" \
    -v "${SHARED_DIR}:/mt5-shared" \
    -e PASSWORD=install \
    -e INSTANCE_NAME=installer \
    -e DISPLAY=:1 \
    -e MANAGEMENT_MODE=true \
    mt5-tigervnc:latest \
    sleep 3600

  # Wait for container to be ready
  sleep 10

  # Download MT5 installer
  docker exec "$tmp_container" bash -c '
    echo "Downloading MT5..."
    curl -sL "https://download.mql5.com/cdn/web/14115/mt5/mt5webinstall.exe" -o /tmp/mt5setup.exe
    echo "Download complete ($(stat -c%s /tmp/mt5setup.exe) bytes)"
  '

  # Install MT5 via Wine
  docker exec "$tmp_container" bash -c '
    export WINEPREFIX=/config/.wine
    export WINEARCH=win64
    export DISPLAY=:1
    export MT5_DIR="/config/.wine/drive_c/Program Files/MetaTrader 5"

    echo "Installing MT5 (this may take 2-3 minutes)..."
    wine /tmp/mt5setup.exe /auto /portable /lang:en /dir:"Z:\config\.wine\drive_c\Program Files\MetaTrader 5" 2>/dev/null

    # Wait for installation to finish
    for i in $(seq 1 60); do
      if [ -f "$MT5_DIR/terminal64.exe" ]; then
        echo "MT5 installed successfully"
        break
      fi
      sleep 5
    done
  '

  # Copy to shared directory
  docker exec "$tmp_container" bash -c '
    export MT5_DIR="/config/.wine/drive_c/Program Files/MetaTrader 5"
    mkdir -p /mt5-shared/MetaTrader\ 5
    echo "Copying MT5 files to shared directory..."
    cp -r "$MT5_DIR"/* /mt5-shared/MetaTrader\ 5/ 2>/dev/null || true
    echo "Copy complete"
  '

  # Cleanup
  docker rm -f "$tmp_container" >/dev/null 2>&1 || true

  if [ -f "${mt5_dir}/terminal64.exe" ]; then
    log "MetaTrader 5 installed (${mt5_dir}/terminal64.exe)"
  else
    warn "MT5 installation may have failed. You can install manually by placing MT5 files in ${mt5_dir}"
  fi
}

install_deps_and_build() {
  cd "$INSTALL_DIR"
  warn "Installing project dependencies..."
  bun install
  log "Dependencies installed"

  warn "Building project..."
  bun run build
  log "Project built"
}

create_env_file() {
  local env_file="${DATA_DIR}/.env"
  cat > "$env_file" << EOF
# MT5 Manager Configuration
NODE_ENV=production
PORT=${WEB_PORT}
HOST=$(hostname -I | awk '{print $1}')
HOST_IP=$(hostname -I | awk '{print $1}')
DB_PATH=${DB_PATH}
INSTANCES_DIR=${INSTANCES_DIR}
SHARED_DIR=${SHARED_DIR}
RUNTIME_DIR=${INSTALL_DIR}/runtime
BRIDGE_SRC=${INSTALL_DIR}/scripts/mt5-bridge
SOCKET_PORT=${SOCKET_PORT}
SOCKET_SECRET=${SOCKET_SECRET}
NEXT_PUBLIC_SOCKET_URL=http://$(hostname -I | awk '{print $1}'):${SOCKET_PORT}
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=mt5-configs
MAX_INSTANCES=10
EOF
  log "Environment file created at ${env_file}"
}

create_systemd_services() {
  # mt5-web (Next.js + API)
  cat > /etc/systemd/system/mt5-web.service << UNIT
[Unit]
Description=MT5 Manager Web UI + API
After=network.target docker.service
Wants=docker.service

[Service]
Type=exec
User=root
WorkingDirectory=${INSTALL_DIR}/apps/web
EnvironmentFile=${DATA_DIR}/.env
ExecStart=${HOME}/.bun/bin/bun run start --port ${WEB_PORT}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

  # mt5-socket (Socket.io server)
  cat > /etc/systemd/system/mt5-socket.service << UNIT
[Unit]
Description=MT5 Manager Socket Server
After=network.target
Wants=network.target

[Service]
Type=exec
User=root
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${DATA_DIR}/.env
ExecStart=${HOME}/.bun/bin/bun run packages/socket-server/src/index.ts
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  log "Systemd services created"
}

enable_and_start() {
  systemctl enable mt5-socket mt5-web
  systemctl restart mt5-socket
  sleep 2
  systemctl restart mt5-web
  sleep 3

  # Verify
  if systemctl is-active --quiet mt5-web; then
    log "mt5-web service is running"
  else
    warn "mt5-web service failed. Check: journalctl -u mt5-web -n 50"
  fi

  if systemctl is-active --quiet mt5-socket; then
    log "mt5-socket service is running"
  else
    warn "mt5-socket service failed. Check: journalctl -u mt5-socket -n 50"
  fi
}

show_summary() {
  local ip; ip=$(hostname -I | awk '{print $1}')
  echo ""
  echo "================================================"
  echo -e "${GREEN}  MT5 Manager Installation Complete${NC}"
  echo "================================================"
  echo ""
  echo "  Web UI:     http://${ip}:${WEB_PORT}"
  echo "  Setup:      http://${ip}:${WEB_PORT}/setup"
  echo "  MinIO:      http://${ip}:9001 (admin/minioadmin)"
  echo ""
  echo "  Data:       ${DATA_DIR}"
  echo "  Project:    ${INSTALL_DIR}"
  echo ""
  echo "  Services:"
  echo "    mt5-web    (port ${WEB_PORT})"
  echo "    mt5-socket (port ${SOCKET_PORT})"
  echo ""
  echo "  Commands:"
  echo "    journalctl -u mt5-web -f    (tail web logs)"
  echo "    journalctl -u mt5-socket -f (tail socket logs)"
  echo "    systemctl restart mt5-web   (restart web)"
  echo "    systemctl restart mt5-socket (restart socket)"
  echo ""
  echo "  Open http://${ip}:${WEB_PORT}/setup to complete"
  echo "  the setup wizard (create admin user + management VM)."
  echo ""
  echo "================================================"
}

# === MAIN ===
if [ "$(id -u)" -ne 0 ]; then
  err "This script must be run as root"
  exit 1
fi

echo ""
echo "MT5 Manager Installer"
echo "====================="
echo ""

install_docker
install_bun
setup_directories
clone_project
build_docker_image
install_mt5
start_minio
install_deps_and_build
create_env_file
create_systemd_services
enable_and_start
show_summary
