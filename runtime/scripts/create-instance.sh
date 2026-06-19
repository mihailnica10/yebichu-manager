#!/bin/bash
# create-instance.sh <name> <port-offset>
# Bootstraps a new MT5 instance with fresh Wine prefix
set -e

NAME="${1:-}"
OFFSET="${2:-}"
if [ -z "$NAME" ] || [ -z "$OFFSET" ]; then
    echo "Usage: $0 <instance-name> <port-offset>"
    echo "  Example: $0 mt5-3 3  -> ports 3003, 8003"
    exit 1
fi

MT5_DIR="/home/misu/mt5"
INSTANCE_DIR="$MT5_DIR/instances/$NAME"
COMPOSE_FILE="$MT5_DIR/docker-compose.yaml"

if [ -d "$INSTANCE_DIR" ]; then
    echo "Instance '$NAME' already exists at $INSTANCE_DIR"
    exit 1
fi

echo "Creating instance '$NAME' (port offset: $OFFSET)..."

mkdir -p "$INSTANCE_DIR/wine"
mkdir -p "$INSTANCE_DIR/data"

# Create empty data structure
mkdir -p "$INSTANCE_DIR/data"/{Config,Bases,logs,Tester,MQL5/Files,MQL5/logs}

# Add to docker-compose.yaml
cat >> "$COMPOSE_FILE" << EOF

  $NAME:
    <<: *mt5-common
    container_name: $NAME
    environment:
      INSTANCE_NAME: $NAME
    ports:
      - "300${OFFSET}:3000"
      - "800${OFFSET}:8001"
    volumes:
      - mt5-shared:/mt5-shared
      - mt5-${NAME}-data:/mt5-instance
      - mt5-${NAME}-wine:/config/.wine

volumes:
  mt5-${NAME}-data:
    driver: local
    driver_opts:
      type: none
      device: ${INSTANCE_DIR}/data
      o: bind
  mt5-${NAME}-wine:
    driver: local
    driver_opts:
      type: none
      device: ${INSTANCE_DIR}/wine
      o: bind
EOF

echo "Instance '$NAME' created."
echo "  Ports: VNC=300${OFFSET}, API=800${OFFSET}"
echo "  Wine: $INSTANCE_DIR/wine"
echo "  Data: $INSTANCE_DIR/data"
echo ""
echo "Next step: docker compose -f $COMPOSE_FILE up -d $NAME"
