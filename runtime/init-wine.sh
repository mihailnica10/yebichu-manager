#!/bin/bash
# One-time Wine prefix initialization.
# Runs on first container startup to initialize the Wine prefix,
# install Mono, Gecko-disabled, and copy pre-installed Python + MT5.
# The prefix is in a Docker volume, so this runs ONCE per instance lifetime.
# NOTE: vcrun2019 and corefonts are PRE-INSTALLED in the Docker build layer.

set -e
WINEPREFIX="${WINEPREFIX:-/config/.wine}"
WINE_MONO_MSI="${WINE_MONO_MSI:-/tmp/wine-mono-11.1.0-x86.msi}"

# Check if already initialized (marker file)
if [ -f "$WINEPREFIX/INIT_DONE" ]; then
    exit 0
fi

echo "[INIT-WINE] Initializing Wine prefix at $WINEPREFIX"

# Create prefix if it doesn't exist
mkdir -p "$WINEPREFIX"

# Ensure ownership
chown -R root:root "$WINEPREFIX" 2>/dev/null || true

# Disable Gecko and MSI auto-installers, disable winemenubuilder
export WINEDLLOVERRIDES="winemenubuilder.exe,mscoree=,mshtml="
export WINEDBG_DISABLE=1

# Initialize prefix (auto-installers are suppressed by DLL overrides)
wineboot -u 2>/dev/null
wineserver -w 2>/dev/null

# Kill any lingering installer dialogs
pkill -f "install_mono" 2>/dev/null || true
pkill -f "wine-mono" 2>/dev/null || true

echo "[INIT-WINE] Prefix created, installing Wine Mono..."

# Install Wine Mono manually via msiexec (silent)
if [ -f "$WINE_MONO_MSI" ]; then
    wine msiexec /i "$WINE_MONO_MSI" /quiet 2>/dev/null || true
    wineserver -w 2>/dev/null
    echo "[INIT-WINE] Wine Mono installed"
    rm -f "$WINE_MONO_MSI"
fi

# Disable Gecko in registry
wine reg add "HKLM\\Software\\Wine\\Gecko" /v Version /d "" /f 2>/dev/null || true

# Disable winemenubuilder in Wine registry
wine reg add "HKCU\\Software\\Wine\\Winemenubuilder" /v Disabled /d 1 /f 2>/dev/null || true
wineserver -w 2>/dev/null

# Remove ucrtbase override (let Wine use default)
wine reg delete "HKCU\\Software\\Wine\\DllOverrides" /v ucrtbase /f 2>/dev/null || true

# Copy pre-installed vcrun2019 DLLs and core fonts (pre-installed during Docker build)
# This avoids running winetricks at runtime (saves ~3-5 minutes)
echo "[INIT-WINE] Copying pre-installed VC++ runtime DLLs..."
mkdir -p "$WINEPREFIX/drive_c/windows/system32"
if [ -d /opt/wine-vcrun ] && [ "$(ls -A /opt/wine-vcrun 2>/dev/null)" ]; then
    cp -r /opt/wine-vcrun/* "$WINEPREFIX/drive_c/windows/system32/" 2>/dev/null || true
fi

echo "[INIT-WINE] Copying pre-installed core fonts..."
mkdir -p "$WINEPREFIX/drive_c/windows/Fonts"
if [ -d /opt/wine-fonts ] && [ "$(ls -A /opt/wine-fonts 2>/dev/null)" ]; then
    cp -r /opt/wine-fonts/* "$WINEPREFIX/drive_c/windows/Fonts/" 2>/dev/null || true
fi
wineserver -w 2>/dev/null

# Copy Python for Windows from pre-installed snapshot (built into Docker image)
PYDIR="$WINEPREFIX/drive_c/users/root/AppData/Local/Programs/Python/Python311"
PYTHON_EXE="$PYDIR/python.exe"

if [ -d /opt/python-wine ] && [ -f /opt/python-wine/python.exe ]; then
    echo "[INIT-WINE] Copying Python for Windows from pre-installed snapshot..."
    mkdir -p "$PYDIR"
    cp -r /opt/python-wine/* "$PYDIR/" 2>/dev/null || true
    echo "[INIT-WINE] Python files copied"

    # Set up Wine registry entries so 'wine python' can find Python
    # Add Python to the system PATH
    wine reg add "HKLM\\System\\CurrentControlSet\\Control\\Session Manager\\Environment" \
        /v Path /d "%SystemRoot%\\system32;%SystemRoot%;%SystemRoot%\\system32\\wbem;%SystemRoot%\\system32\\WindowsPowershell\\v1.0;C:\\users\\root\\AppData\\Local\\Programs\\Python\\Python311" /t REG_EXPAND_SZ /f 2>/dev/null || true

    # Register Python App Paths so Wine can find python.exe
    wine reg add "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\python.exe" \
        /ve /d "C:\\users\\root\\AppData\\Local\\Programs\\Python\\Python311\\python.exe" /f 2>/dev/null || true
    wine reg add "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\python.exe" \
        /v "Path" /d "C:\\users\\root\\AppData\\Local\\Programs\\Python\\Python311" /f 2>/dev/null || true

    # Set Python as the default Python in Wine
    wine reg add "HKLM\\Software\\Python\\PythonCore\\3.11\\InstallPath" \
        /ve /d "C:\\users\\root\\AppData\\Local\\Programs\\Python\\Python311" /f 2>/dev/null || true
    wine reg add "HKCU\\Software\\Python\\PythonCore\\3.11\\InstallPath" \
        /ve /d "C:\\users\\root\\AppData\\Local\\Programs\\Python\\Python311" /f 2>/dev/null || true

    wineserver -w 2>/dev/null
    echo "[INIT-WINE] Python registry entries configured"
fi

# Install pip packages using the Wine Python (works now that registry is set up)
if [ -f "$PYTHON_EXE" ]; then
    echo "[INIT-WINE] Ensuring pip is available..."
    wine "$PYTHON_EXE" -m ensurepip --default-pip 2>/dev/null || true
    wineserver -w 2>/dev/null

    echo "[INIT-WINE] Installing MetaTrader5 + rpyc + numpy under Wine Python..."
    wine "$PYTHON_EXE" -m pip install --upgrade pip 2>/dev/null || true
    wine "$PYTHON_EXE" -m pip install "rpyc>=6.0.0" "numpy<2" MetaTrader5 2>/dev/null || true
    wineserver -w 2>/dev/null
    echo "[INIT-WINE] MetaTrader5 + rpyc + numpy installed"
fi

# Install MetaTrader 5 from pre-installed snapshot if not already installed
MT5_DIR="$WINEPREFIX/drive_c/Program Files/MetaTrader 5"
if [ ! -f "$MT5_DIR/terminal64.exe" ] && [ -d /opt/mt5-install ] && [ -f /opt/mt5-install/terminal64.exe ]; then
    echo "[INIT-WINE] Copying MetaTrader 5 from pre-installed snapshot..."
    mkdir -p "$MT5_DIR"
    cp -r /opt/mt5-install/* "$MT5_DIR/" 2>/dev/null || true
    wineserver -w 2>/dev/null
    echo "[INIT-WINE] MetaTrader 5 pre-installed copy complete"
fi

# Mark initialization as done
touch "$WINEPREFIX/INIT_DONE"
echo "[INIT-WINE] Wine prefix initialized successfully"
