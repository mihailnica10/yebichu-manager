#!/bin/bash
# Build helper script for Dockerfile layer 4.5
# Pre-installs MT5, Python, vcrun2019, corefonts into /opt/ snapshots

set -e
export DEBIAN_FRONTEND=noninteractive

WINEPREFIX=/tmp/wine-build
DISPLAY=:99

echo "[BUILD] Starting Xvfb..."
Xvfb $DISPLAY -screen 0 1024x768x24 &
XVFB_PID=$!
sleep 2

echo "[BUILD] Setting up Wine prefix..."
export DISPLAY
export WINEPREFIX
export WINEDLLOVERRIDES="winemenubuilder.exe,mscoree=,mshtml=,ucrtbase=b,n"
mkdir -p "$WINEPREFIX"
wineboot -u 2>/dev/null
wineserver -w 2>/dev/null

echo "[BUILD] Installing Wine Mono..."
wine msiexec /i /tmp/wine-mono-*.msi /quiet 2>/dev/null || true
wineserver -w 2>/dev/null

echo "[BUILD] Disabling winemenubuilder..."
wine reg add "HKCU\\Software\\Wine\\Winemenubuilder" /v Disabled /d 1 /f 2>/dev/null || true
wineserver -w 2>/dev/null

echo "[BUILD] Installing Python for Windows..."
wine /tmp/python-3.11.9-amd64.exe /quiet InstallAllUsers=0 PrependPath=1 Include_test=0 Include_tcltk=0 Include_launcher=0 2>/dev/null || true
wineserver -w 2>/dev/null

PYDIR="$WINEPREFIX/drive_c/users/root/AppData/Local/Programs/Python/Python311"
if [ -f "$PYDIR/python.exe" ]; then
    echo "[BUILD] Installing MetaTrader5 + rpyc + numpy under Wine Python..."
    wine "$PYDIR/python.exe" -m ensurepip --default-pip 2>/dev/null || true
    wine "$PYDIR/python.exe" -m pip install --upgrade pip 2>/dev/null || true
    wine "$PYDIR/python.exe" -m pip install "rpyc>=6.0.0" "numpy<2" MetaTrader5 2>/dev/null || true
    wineserver -w 2>/dev/null
fi

echo "[BUILD] Installing vcrun2019 and corefonts via winetricks..."
# vcrun2019 includes ucrtbase.dll (forward-compat UCRT for downlevel Windows)
timeout 180 winetricks --unattended vcrun2019 corefonts 2>/dev/null || true
wineserver -w 2>/dev/null

echo "[BUILD] Checking ucrtbase.dll for crealf function..."
if [ -f "$WINEPREFIX/drive_c/windows/system32/ucrtbase.dll" ]; then
    if strings "$WINEPREFIX/drive_c/windows/system32/ucrtbase.dll" | grep -q "crealf"; then
        echo "[BUILD] ucrtbase.dll has crealf ✓"
    else
        echo "[BUILD] Note: ucrtbase.dll lacks crealf (pre-import + WINEDBG_DISABLE workaround active)"
    fi
fi

echo "[BUILD] Installing MetaTrader 5..."
wine /tmp/mt5setup.exe /auto 2>/dev/null || true
wineserver -w 2>/dev/null

echo "[BUILD] Exporting pre-installed directories..."
mkdir -p /opt/mt5-install /opt/python-wine /opt/wine-vcrun /opt/wine-fonts

cp -r "$WINEPREFIX/drive_c/Program Files/MetaTrader 5"/* /opt/mt5-install/ 2>/dev/null || true

if [ -d "$PYDIR" ]; then
    cp -r "$PYDIR"/* /opt/python-wine/ 2>/dev/null || true
fi

# Copy vcrun DLLs (including ucrtbase from Windows native)
if [ -d "$WINEPREFIX/drive_c/windows/system32" ]; then
    for dll in vcruntime140.dll vcruntime140_1.dll msvcp140.dll msvcp140_1.dll msvcp140_2.dll msvcp140_3.dll ucrtbase.dll; do
        if [ -f "$WINEPREFIX/drive_c/windows/system32/$dll" ]; then
            cp "$WINEPREFIX/drive_c/windows/system32/$dll" /opt/wine-vcrun/ 2>/dev/null || true
        fi
    done
fi

# Copy core fonts
if [ -d "$WINEPREFIX/drive_c/windows/Fonts" ]; then
    for font in arial.ttf arialbd.ttf ariali.ttf arialbi.ttf times.ttf timesbd.ttf timesi.ttf timesbi.ttf cour.ttf courbd.ttf couri.ttf couri.ttf georgia.ttf georgiab.ttf georgiai.ttf georgiaib.ttf impact.ttf trebuc.ttf trebucbd.ttf trebucit.ttf trebucbi.ttf verdana.ttf verdanab.ttf verdanai.ttf verdanabi.ttf webding.ttf comic.ttf andalemo.ttf; do
        if [ -f "$WINEPREFIX/drive_c/windows/Fonts/$font" ]; then
            cp "$WINEPREFIX/drive_c/windows/Fonts/$font" /opt/wine-fonts/ 2>/dev/null || true
        fi
    done
fi

echo "[BUILD] Cleanup..."
kill $XVFB_PID 2>/dev/null || true
wineserver -w 2>/dev/null || true
rm -rf "$WINEPREFIX" /tmp/wine-mono-*.msi

echo "[BUILD] Pre-install complete"