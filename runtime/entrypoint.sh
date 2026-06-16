#!/bin/bash

MANAGEMENT_MODE="${MANAGEMENT_MODE:-false}"
PASSWORD="${PASSWORD:-changeme}"
MT5_INSTANCE_NAME="${INSTANCE_NAME:-mt5}"
ENABLE_FILEBROWSER="${ENABLE_FILEBROWSER:-false}"
ENABLE_API="${ENABLE_API:-true}"

MT5_DIR="/config/.wine/drive_c/Program Files/MetaTrader 5"
SHARED_DIR="/mt5-shared/MetaTrader 5"
INSTANCE_DIR="/mt5-instance"

export HOME=/root
export DISPLAY=:1

echo "[ENTRYPOINT] Starting MT5 instance: $MT5_INSTANCE_NAME"

wait_for_process() {
    local process_name="$1"
    local timeout="${2:-30}"
    local interval="${3:-1}"
    for i in $(seq 1 "$timeout"); do
        if pgrep -x "$process_name" > /dev/null 2>&1 || pgrep -f "$process_name" > /dev/null 2>&1; then
            return 0
        fi
        sleep "$interval"
    done
    return 1
}

wait_for_x11() {
    local timeout="${1:-10}"
    for i in $(seq 1 "$timeout"); do
        if [ -e /tmp/.X11-unix/X1 ] && xdpyinfo -display :1 > /dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    return 1
}

mkdir -p /var/run/dbus
rm -f /var/run/dbus/* /var/run/messagebus.*
dbus-daemon --system &
wait_for_process dbus-daemon 5

rm -f /tmp/.X1-lock /tmp/.X11-unix/X1
Xvnc :1 -geometry ${VNC_GEOMETRY:-1280x720} -depth 24 -SecurityTypes None -rfbport 5901 &
wait_for_x11 10

export $(dbus-launch)
startxfce4 &
wait_for_process xfce4-panel 10

websockify 6080 localhost:5901 &
echo "[ENTRYPOINT] websockify on :6080"

echo "[ENTRYPOINT] Xvnc + Xfce4 started"

# Initialize Wine prefix (first boot only)
if [ -f /usr/local/bin/init-wine.sh ]; then
    /usr/local/bin/init-wine.sh 2>&1 | sed 's/^/[INIT-WINE] /'
fi

if [ ! -d "$MT5_DIR" ]; then
    mkdir -p "$MT5_DIR"
fi

# Fix Wine prefix ownership (bind-mounted volume may have wrong owner)
chown -R root:root /config/.wine 2>/dev/null || true

cd "$MT5_DIR"

if [ -f "$SHARED_DIR/terminal64.exe" ]; then
    echo "[ENTRYPOINT] Setting up MT5 symlinks..."

    ensure_symlink() {
        local target="$1"
        local link="$2"
        if [ ! -e "$target" ]; then return; fi
        if [ -L "$link" ]; then
            local current
            current=$(readlink "$link")
            if [ "$current" = "$target" ]; then return; fi
            rm -f "$link"
        elif [ -e "$link" ]; then
            rm -rf "$link"
        fi
        ln -sf "$target" "$link"
    }

    ensure_dir() {
        local dir="$1"
        if [ ! -d "$dir" ]; then mkdir -p "$dir"; fi
    }

    for item in "$SHARED_DIR"/*; do
        base=$(basename "$item")
        case "$base" in
            Config|Bases|logs|Tester) ;;
            MQL5)
                mkdir -p "$MT5_DIR/MQL5"
                for subitem in "$item"/*; do
                    subbase=$(basename "$subitem")
                    case "$subbase" in
                        Files|logs) ensure_dir "$MT5_DIR/MQL5/$subbase" ;;
                        *) ensure_symlink "$subitem" "$MT5_DIR/MQL5/$subbase" ;;
                    esac
                done
                for instance_sub in Files logs; do
                    if [ -d "$INSTANCE_DIR/MQL5/$instance_sub" ]; then
                        ensure_symlink "$INSTANCE_DIR/MQL5/$instance_sub" "$MT5_DIR/MQL5/$instance_sub"
                    fi
                done
                if [ -f "$INSTANCE_DIR/MQL5/experts.dat" ]; then
                    ensure_symlink "$INSTANCE_DIR/MQL5/experts.dat" "$MT5_DIR/MQL5/experts.dat"
                fi
                if [ -f "$INSTANCE_DIR/MQL5/externaldata" ]; then
                    ensure_symlink "$INSTANCE_DIR/MQL5/externaldata" "$MT5_DIR/MQL5/externaldata"
                fi
                ;;
            *)
                if [ -d "$item" ] || [ -f "$item" ]; then
                    ensure_symlink "$item" "$MT5_DIR/$base"
                fi
                ;;
        esac
    done

    for d in Config Bases logs Tester; do
        if [ -d "$INSTANCE_DIR/$d" ] && [ "$(ls -A "$INSTANCE_DIR/$d" 2>/dev/null)" ]; then
            mkdir -p "$MT5_DIR/$d"
            for item in "$INSTANCE_DIR/$d"/*; do
                [ -e "$item" ] || continue
                ensure_symlink "$item" "$MT5_DIR/$d/$(basename "$item")"
            done
        fi
    done

    echo "[ENTRYPOINT] Symlinks ready"
fi

# Management mode: isolated workspace, no shared symlinks for Profiles/MQL5
if [ "$MANAGEMENT_MODE" = "true" ]; then
  echo "[ENTRYPOINT] Management mode — isolated workspace"

  # Remove symlinks created above and replace with real directories so that
  # subsequent seeding writes into instance-local storage, not into the shared dir.
  for dir in "MQL5/Experts" "MQL5/Indicators" "MQL5/Include" "MQL5/Libraries" "MQL5/Scripts" "MQL5/Services" "MQL5/Presets" "MQL5/Images" "MQL5/Profiles" "Profiles"; do
    if [ -L "$MT5_DIR/$dir" ]; then
      target=$(readlink "$MT5_DIR/$dir")
      rm -f "$MT5_DIR/$dir"
      cp -r "$target" "$MT5_DIR/$dir" 2>/dev/null || mkdir -p "$MT5_DIR/$dir"
    fi
  done

  # Seed default Profiles/MQL5 from shared if not done yet
  SEED_MARKER="/config/.wine/mgmt_seeded"
  if [ ! -f "$SEED_MARKER" ]; then
    for dir in Profiles MQL5; do
      if [ -d "$SHARED_DIR/$dir" ]; then
        echo "[ENTRYPOINT] Seeding $dir from shared..."
        mkdir -p "$MT5_DIR/$dir"
        cp -rn "$SHARED_DIR/$dir/"* "$MT5_DIR/$dir/" 2>/dev/null || true
      fi
    done
    touch "$SEED_MARKER"
    echo "[ENTRYPOINT] Seed complete — management instance has its own copies"
  fi
fi

if [ "$MANAGEMENT_MODE" != "true" ] && [ "$ENABLE_FILEBROWSER" = "true" ]; then
    filebrowser --port 8080 --address 0.0.0.0 --root "$SHARED_DIR/MQL5" --auth-method=noauth &
    echo "[ENTRYPOINT] Filebrowser on :8080"
fi

if [ -f "$MT5_DIR/terminal64.exe" ]; then
    [ -f /etc/mt5/mt5cfg.ini ] && cp /etc/mt5/mt5cfg.ini "$MT5_DIR/" 2>/dev/null || true
    echo "[ENTRYPOINT] Starting MT5..."
    cd "$MT5_DIR"
    wine terminal64.exe /portable /withdrawal:disabled &

    for i in $(seq 1 30); do
        if pgrep -f "terminal64.exe" > /dev/null 2>&1; then
            echo "[ENTRYPOINT] MT5 terminal is running"
            break
        fi
        sleep 1
    done
    if ! pgrep -f "terminal64.exe" > /dev/null 2>&1; then
        echo "[WARN] MT5 terminal did not start within 30 seconds"
    fi
fi

sleep 4 && pgrep -f terminal64.exe > /dev/null && \
  xdotool search --name "MetaTrader 5" windowactivate 2>/dev/null || true &

if [ "$ENABLE_API" = "true" ] && [ -f /mt5-bridge/main.py ]; then
    echo "[ENTRYPOINT] Starting rpyc server on port 18812..."
    wine python -m rpyc.cli.rpyc_classic --host 0.0.0.0 --port 18812 > /dev/null 2>&1 &

    echo "[ENTRYPOINT] Starting MT5 Bridge on port 8090..."
    cd /mt5-bridge
    python3 -m uvicorn main:app --host 0.0.0.0 --port 8090 --reload &
    sleep 2
    echo "[ENTRYPOINT] Bridge started (uvicorn --reload)"
fi

echo "[ENTRYPOINT] All services started. Monitoring..."
trap "echo '[ENTRYPOINT] Shutting down...'; kill 0; exit 0" SIGTERM SIGINT

while true; do
    sleep 15
    if ! pgrep -x "Xvnc" > /dev/null 2>&1; then
        echo "[ENTRYPOINT] Xvnc died, restarting..."
        Xvnc :1 -geometry ${VNC_GEOMETRY:-1280x720} -depth 24 -SecurityTypes None -rfbport 5901 &
    fi
    if ! pgrep -f "terminal64.exe" > /dev/null 2>&1; then
        echo "[ENTRYPOINT] MT5 terminal died, restarting..."
        cd "$MT5_DIR"
        wine terminal64.exe /portable /withdrawal:disabled &
    fi
    if ! pgrep -f "uvicorn main:app" > /dev/null 2>&1; then
        echo "[ENTRYPOINT] Bridge died, restarting..."
        cd /mt5-bridge
        python3 -m uvicorn main:app --host 0.0.0.0 --port 8090 --reload &
    fi
done
