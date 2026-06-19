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
export WINEDLLOVERRIDES="mscoree=,mshtml=,ucrtbase=n"
export WINEDEBUG=-all

echo "[ENTRYPOINT] Starting yebichu MT5 instance: $MT5_INSTANCE_NAME"

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
    local display_num="${1:-99}"
    local timeout="${2:-10}"
    for i in $(seq 1 "$timeout"); do
        if [ -e /tmp/.X11-unix/X${display_num} ] && xdpyinfo -display :${display_num} > /dev/null 2>&1; then
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

VNC_DISPLAY_FILE="/tmp/vnc_display"
VNC_LOG_FILE="/tmp/vnc.log"
PREFERRED_VNC_DISPLAY=99

rm -f /tmp/.X${PREFERRED_VNC_DISPLAY}-lock /tmp/.X11-unix/X${PREFERRED_VNC_DISPLAY}
rm -f "$VNC_DISPLAY_FILE" "$VNC_LOG_FILE"

Xvnc :${PREFERRED_VNC_DISPLAY} -geometry ${VNC_GEOMETRY:-1280x720} -depth 24 -SecurityTypes None -rfbport 5901 > "$VNC_LOG_FILE" 2>&1 &
sleep 2

if grep -q "started on display" "$VNC_LOG_FILE" 2>/dev/null; then
    VNC_ACTUAL_DISPLAY=$(grep "started on display" "$VNC_LOG_FILE" | sed 's/.*started on display //' | tr -d ':[:space:]')
    echo "$VNC_ACTUAL_DISPLAY" > "$VNC_DISPLAY_FILE"
    export DISPLAY=":$VNC_ACTUAL_DISPLAY"
    echo "[ENTRYPOINT] Xvnc started on display :$VNC_ACTUAL_DISPLAY"
else
    export DISPLAY=":${PREFERRED_VNC_DISPLAY}"
    echo "${PREFERRED_VNC_DISPLAY}" > "$VNC_DISPLAY_FILE"
    echo "[ENTRYPOINT] Xvnc started on preferred display :${PREFERRED_VNC_DISPLAY}"
fi

wait_for_x11 "${DISPLAY#:}" 10

export $(dbus-launch)

# Window manager + desktop (no xfce4-session, no panel)
xfwm4 --replace &
xfdesktop &
wait_for_process xfdesktop 10

# Apply xfwm4 settings: single workspace, no scroll/wrap, Daloa theme, no compositing
xfconf-query -c xfwm4 -p /general/workspace_count -s 1 2>/dev/null || true
xfconf-query -c xfwm4 -p /general/scroll_workspaces -s false 2>/dev/null || true
xfconf-query -c xfwm4 -p /general/wrap_workspaces -s false 2>/dev/null || true
xfconf-query -c xfwm4 -p /general/wrap_cycle -s false 2>/dev/null || true
xfconf-query -c xfwm4 -p /general/zoom_desktop -s false 2>/dev/null || true
xfconf-query -c xfwm4 -p /general/theme -s "Daloa" 2>/dev/null || true
xfconf-query -c xfwm4 -p /general/use_compositing -s false 2>/dev/null || true

# Disable winemenubuilder in Wine registry to prevent auto-placed .desktop files
wine reg add "HKCU\\Software\\Wine\\Winemenubuilder" /v Disabled /d 1 /f 2>/dev/null || true
wineserver -w 2>/dev/null

# Clean up auto-placed .desktop files (MetaTrader installer drops its own)
rm -f "/root/Desktop/MetaTrader 5.desktop" \
      "/root/Desktop/MetaEditor 5.desktop" \
      "/root/Desktop/Uninstall MetaTrader 5.desktop"

# Write a clean icons config — only the mt5 shortcut, no / or /root
mkdir -p /root/.config/xfce4/desktop
cat > /root/.config/xfce4/desktop/icons.screen0.rc << 'EOF'
[xfdesktop-version-4.10.3+-rcfile_format]
4.10.3+=true

[/root/Desktop/mt5.desktop]
row=0
col=0
EOF

# Remove any lingering File System / Home icon entries from old icons configs
for f in /root/.config/xfce4/desktop/icons.screen0*.rc /root/.config/xfce4/desktop/icons.screen.latest.rc; do
    if [ -f "$f" ]; then
        sed -i '/^\[file/d' "$f" 2>/dev/null || true
    fi
done

rm -f /root/.config/xfce4/desktop/icons.screen.latest.rc
rm -f /root/.config/xfce4/desktop/icons.screen0-*.rc
ln -s /root/.config/xfce4/desktop/icons.screen0.rc \
      /root/.config/xfce4/desktop/icons.screen.latest.rc

websockify 6080 localhost:5901 &
echo "[ENTRYPOINT] websockify on :6080"

echo "[ENTRYPOINT] Xvnc + Xfce4 started"

# Initialize Wine prefix (first boot only)
if [ -f /usr/local/bin/init-wine.sh ]; then
    /usr/local/bin/init-wine.sh 2>&1 | sed 's/^/[INIT-WINE] /'
fi

# Re-apply winemenubuilder disable after init-wine
wine reg add "HKCU\\Software\\Wine\\Winemenubuilder" /v Disabled /d 1 /f 2>/dev/null || true
wine reg delete "HKCU\\Software\\Wine\\DllOverrides" /v ucrtbase /f 2>/dev/null || true
wine reg delete "HKCU\\Software\\Wine\\DllOverrides" /v api-ms-win-crt-private-l1-1-0 /f 2>/dev/null || true
# Disable Wine crash dialog (winedbg) so crashed processes terminate cleanly
wine reg add "HKCU\\Software\\Wine\\WineDbg" /v ShowCrashDialog /d 0 /f 2>/dev/null || true
wine reg add "HKCU\\Software\\Wine\\WineDbg" /v Debugger /d "" /f 2>/dev/null || true

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

  # Remove symlinks created above and replace with real directories
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

if [ ! -f "$MT5_DIR/terminal64.exe" ]; then
    echo "[ENTRYPOINT] MT5 not installed. Installing..."
    if [ -f /tmp/mt5setup.exe ]; then
        echo "[ENTRYPOINT] Running cached installer..."
    else
        echo "[ENTRYPOINT] Downloading MT5 installer..."
        curl -sL -o /tmp/mt5setup.exe \
            "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe"
    fi
    wine /tmp/mt5setup.exe /auto 2>/dev/null || true
    wineserver -w 2>/dev/null
    rm -f /tmp/mt5setup.exe
    # Re-clean after install (MT5 installer drops more .desktop files)
    rm -f "/root/Desktop/MetaTrader 5.desktop" \
          "/root/Desktop/MetaEditor 5.desktop" \
          "/root/Desktop/Uninstall MetaTrader 5.desktop"
    echo "[ENTRYPOINT] MT5 installation complete"
fi

# Auto-start MT5
if [ -f "$MT5_DIR/terminal64.exe" ]; then
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
fi

if [ "$ENABLE_API" = "true" ] && [ -f /mt5-bridge/main.py ]; then
    echo "[ENTRYPOINT] Starting rpyc server on port 18812..."
    PYTHON_EXE="/config/.wine/drive_c/users/root/AppData/Local/Programs/Python/Python311/python.exe"
    wine "$PYTHON_EXE" /mt5-bridge/start_rpyc.py 18812 > /tmp/rpyc.stdout.log 2>&1 &

    echo "[ENTRYPOINT] Starting MT5 Bridge on port 8090..."
    cd /mt5-bridge
    python3 -m uvicorn main:app --host 0.0.0.0 --port 8090 > /tmp/bridge.stdout.log 2>&1 &
    echo "[ENTRYPOINT] Bridge starting (uvicorn on :8090)"
fi

echo "[ENTRYPOINT] All services started. Monitoring..."
trap "echo '[ENTRYPOINT] Shutting down...'; kill 0; exit 0" SIGTERM SIGINT

# Watchdog: all core services including MT5
while true; do
    sleep 15

    # Kill stuck Wine debuggers (winedbg) that would otherwise hang processes forever
    if pgrep -f "winedbg" > /dev/null 2>&1; then
        pkill -f "winedbg" 2>/dev/null || true
    fi

    if ! pgrep -x "Xvnc" > /dev/null 2>&1; then
        echo "[ENTRYPOINT] Xvnc died, restarting..."
        VNC_DISP=$(cat "$VNC_DISPLAY_FILE" 2>/dev/null || echo "${PREFERRED_VNC_DISPLAY:-99}")
        rm -f /tmp/.X${VNC_DISP}-lock /tmp/.X11-unix/X${VNC_DISP}
        Xvnc :${VNC_DISP} -geometry ${VNC_GEOMETRY:-1280x720} -depth 24 -SecurityTypes None -rfbport 5901 > "$VNC_LOG_FILE" 2>&1 &
    fi
    if ! pgrep -f "xfwm4" > /dev/null 2>&1; then
        echo "[ENTRYPOINT] xfwm4 died, restarting..."
        xfwm4 --replace &
    fi
    if ! pgrep -f "xfdesktop" > /dev/null 2>&1; then
        echo "[ENTRYPOINT] xfdesktop died, restarting..."
        xfdesktop &
    fi
    if [ -f "$MT5_DIR/terminal64.exe" ]; then
        if ! pgrep -f "terminal64.exe" > /dev/null 2>&1; then
            echo "[ENTRYPOINT] MT5 died, restarting..."
            cd "$MT5_DIR"
            wine terminal64.exe /portable /withdrawal:disabled &
        fi
    fi
    if ! timeout 1 bash -c 'echo > /dev/tcp/127.0.0.1/18812' 2>/dev/null; then
        echo "[ENTRYPOINT] rpyc server not responding on :18812, restarting..."
        # Kill any stale Wine processes (start.exe wrapper, hung winedbg, dead python)
        pkill -f start_rpyc 2>/dev/null || true
        pkill -f winedbg 2>/dev/null || true
        sleep 1
        PYTHON_EXE="/config/.wine/drive_c/users/root/AppData/Local/Programs/Python/Python311/python.exe"
        wine "$PYTHON_EXE" /mt5-bridge/start_rpyc.py 18812 > /tmp/rpyc.stdout.log 2>&1 &
    fi
    if ! pgrep -f "uvicorn main:app" > /dev/null 2>&1; then
        echo "[ENTRYPOINT] Bridge died, restarting..."
        cd /mt5-bridge
        python3 -m uvicorn main:app --host 0.0.0.0 --port 8090 > /tmp/bridge.stdout.log 2>&1 &
    fi
done
