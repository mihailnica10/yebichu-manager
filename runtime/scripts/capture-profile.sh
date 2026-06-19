#!/bin/bash
# capture-profile.sh <name>
# Captures current MT5 config from all running instances into a named profile
set -e

NAME="${1:-}"
if [ -z "$NAME" ]; then
    echo "Usage: $0 <profile-name>"
    exit 1
fi

PROFILES_DIR="/home/misu/mt5/profiles"
SHARED_DIR="/home/misu/mt5/shared/MetaTrader 5"
PROFILE_DIR="$PROFILES_DIR/$NAME"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

if [ -d "$PROFILE_DIR" ]; then
    echo "Profile '$NAME' already exists. Overwrite? (y/N)"
    read -r answer
    [ "$answer" != "y" ] && exit 1
fi

mkdir -p "$PROFILE_DIR"
echo "{\"name\":\"$NAME\",\"captured\":\"$TIMESTAMP\"}" > "$PROFILE_DIR/meta.json"

echo "Capturing shared MQL5 config..."
mkdir -p "$PROFILE_DIR/MQL5"
rsync -a --relative \
    --include='Experts/*.set' \
    --include='Indicators/' \
    --include='Include/' \
    --include='Libraries/' \
    --include='Scripts/' \
    --include='Images/' \
    --include='Presets/' \
    --exclude='*' \
    "$SHARED_DIR/MQL5/" "$PROFILE_DIR/MQL5/"

echo "Capturing Profiles..."
rsync -a "$SHARED_DIR/Profiles/" "$PROFILE_DIR/Profiles/"

echo "Capturing terminal.ini from all instances..."
mkdir -p "$PROFILE_DIR/Config"
for inst in /home/misu/mt5/instances/*/data/Config/terminal.ini; do
    [ -f "$inst" ] || continue
    inst_name=$(basename "$(dirname "$(dirname "$inst")")")
    cp "$inst" "$PROFILE_DIR/Config/terminal.ini.$inst_name"
done

# Also capture servers.dat (same across instances)
for inst in /home/misu/mt5/instances/*/data/Config/servers.dat; do
    [ -f "$inst" ] || continue
    cp "$inst" "$PROFILE_DIR/Config/servers.dat"
    break
done

echo "Profile '$NAME' captured to $PROFILE_DIR ($(du -sh "$PROFILE_DIR" | cut -f1))"
