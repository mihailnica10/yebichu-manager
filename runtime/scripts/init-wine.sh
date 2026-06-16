#!/bin/bash
# One-time Wine prefix initialization.
# Runs on first container startup to initialize the Wine prefix,
# install Mono, Gecko-disabled, and VC++ runtime.
# The prefix is in a Docker volume, so this runs ONCE per instance lifetime.

set -e
WINEPREFIX="${WINEPREFIX:-/config/.wine}"
WINE_MONO_MSI="${WINE_MONO_MSI:-/tmp/wine-mono-x86.msi}"

# Check if already initialized (marker file)
if [ -f "$WINEPREFIX/INIT_DONE" ]; then
    exit 0
fi

echo "[INIT-WINE] Initializing Wine prefix at $WINEPREFIX"

# Create prefix if it doesn't exist
mkdir -p "$WINEPREFIX"

# Ensure ownership
chown -R root:root "$WINEPREFIX" 2>/dev/null || true

# Disable Gecko (not needed for MT5)
export WINEDLLOVERRIDES="winemenubuilder.exe,mshtml="

# Initialize prefix
wineboot -u 2>/dev/null
wineserver -w 2>/dev/null

echo "[INIT-WINE] Prefix created, installing Wine Mono..."

# Install Wine Mono if available
if [ -f "$WINE_MONO_MSI" ]; then
    wine msiexec /i "$WINE_MONO_MSI" /quiet 2>/dev/null || true
    wineserver -w 2>/dev/null
    echo "[INIT-WINE] Wine Mono installed"
    rm -f "$WINE_MONO_MSI"
fi

# Disable Gecko in registry
wine reg add "HKLM\\Software\\Wine\\Gecko" /v Version /d "" /f 2>/dev/null || true

# Install VC++ runtime and core fonts via winetricks
if command -v winetricks &>/dev/null; then
    echo "[INIT-WINE] Installing vcrun2019 and corefonts via winetricks..."
    winetricks --unattended vcrun2019 corefonts 2>/dev/null || true
    wineserver -w 2>/dev/null
fi

# Mark initialization as done
touch "$WINEPREFIX/INIT_DONE"
echo "[INIT-WINE] Wine prefix initialized successfully"
