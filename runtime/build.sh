#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="yebichu-metatrader5-algotrading"
TAG="${1:-latest}"
FULL_IMAGE="${IMAGE_NAME}:${TAG}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "============================================"
echo " Building: ${FULL_IMAGE}"
echo " Context:  ${PROJECT_DIR}"
echo " Docker:   ${SCRIPT_DIR}/Dockerfile"
echo "============================================"

docker build \
  -f "${SCRIPT_DIR}/Dockerfile" \
  -t "${FULL_IMAGE}" \
  --progress=plain \
  "${PROJECT_DIR}"

echo "============================================"
echo " Build complete!"
echo " Image: ${FULL_IMAGE}"
SIZE=$(docker image inspect "${FULL_IMAGE}" --format='{{.Size}}' 2>/dev/null || echo 0)
SIZE_MB=$((SIZE / 1024 / 1024))
echo " Size:  ${SIZE_MB}MB"
echo "============================================"
