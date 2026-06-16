#!/bin/bash
# apply-profile.sh <name> [instance-names...]
# Applies a named profile to shared MQL5 and optionally to specific instances
set -e

NAME="${1:-}"
if [ -z "$NAME" ]; then
    echo "Usage: $0 <profile-name> [instance-names...]"
    echo "  Without instance names: applies shared data (MQL5, Profiles)"
    echo "  With instance names: also applies terminal.ini, servers.dat"
    exit 1
fi

PROFILES_DIR="/root/mt5/profiles"
SHARED_DIR="/root/mt5/shared"
PROFILE_DIR="$PROFILES_DIR/$NAME"
shift

if [ ! -d "$PROFILE_DIR" ]; then
    echo "Profile '$NAME' not found at $PROFILE_DIR"
    echo "Available profiles:"
    ls "$PROFILES_DIR" 2>/dev/null
    exit 1
fi

echo "Applying profile '$NAME'..."

# Apply shared MQL5 files (overlay, not erase)
if [ -d "$PROFILE_DIR/MQL5" ]; then
    rsync -a "$PROFILE_DIR/MQL5/" "$SHARED_DIR/MetaTrader 5/MQL5/"
    echo "  -> MQL5 updated"
fi

# Apply shared Profiles
if [ -d "$PROFILE_DIR/Profiles" ]; then
    rsync -a "$PROFILE_DIR/Profiles/" "$SHARED_DIR/MetaTrader 5/Profiles/"
    echo "  -> Profiles updated"
fi

# Apply to specific instances
for inst_name in "$@"; do
    INST_DATA="/root/mt5/instances/$inst_name/data"
    if [ ! -d "$INST_DATA" ]; then
        echo "  [SKIP] Instance '$inst_name' not found"
        continue
    fi
    
    if [ -f "$PROFILE_DIR/Config/terminal.ini.$inst_name" ]; then
        cp "$PROFILE_DIR/Config/terminal.ini.$inst_name" "$INST_DATA/Config/terminal.ini"
        echo "  -> $inst_name: terminal.ini applied"
    elif [ -f "$PROFILE_DIR/Config/terminal.ini" ]; then
        cp "$PROFILE_DIR/Config/terminal.ini" "$INST_DATA/Config/terminal.ini"
        echo "  -> $inst_name: terminal.ini applied (generic)"
    fi
    
    if [ -f "$PROFILE_DIR/Config/servers.dat" ]; then
        cp "$PROFILE_DIR/Config/servers.dat" "$INST_DATA/Config/servers.dat"
        echo "  -> $inst_name: servers.dat applied"
    fi
done

echo "Profile '$NAME' applied."
