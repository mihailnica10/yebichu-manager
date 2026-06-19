#!/bin/bash
# list-profiles.sh
# Lists all captured profiles with metadata
set -e

PROFILES_DIR="/home/misu/mt5/profiles"

if [ ! -d "$PROFILES_DIR" ] || [ -z "$(ls -A "$PROFILES_DIR" 2>/dev/null)" ]; then
    echo "No profiles found in $PROFILES_DIR"
    exit 0
fi

echo "Available profiles:"
echo ""

for profile in "$PROFILES_DIR"/*/; do
    name=$(basename "$profile")
    meta="$profile/meta.json"
    
    if [ -f "$meta" ]; then
        captured=$(python3 -c "import json; d=json.load(open('$meta')); print(d.get('captured','?'))" 2>/dev/null || echo "?")
    else
        captured="(no metadata)"
    fi
    
    size=$(du -sh "$profile" | cut -f1)
    
    # Check contents
    has_mql5="no"; has_profiles="no"; has_config="no"
    [ -d "$profile/MQL5" ] && [ "$(ls -A "$profile/MQL5" 2>/dev/null)" ] && has_mql5="yes"
    [ -d "$profile/Profiles" ] && [ "$(ls -A "$profile/Profiles" 2>/dev/null)" ] && has_profiles="yes"
    [ -d "$profile/Config" ] && [ "$(ls -A "$profile/Config" 2>/dev/null)" ] && has_config="yes"
    
    echo "  $name"
    echo "    Size: $size  |  Captured: $captured"
    echo "    MQL5: $has_mql5  |  Profiles: $has_profiles  |  Config: $has_config"
    echo ""
done
