#!/bin/bash
cd "$(dirname "$0")/.."
npx @hey-api/openapi-ts \
  -i scripts/mt5-bridge/openapi.json \
  -o packages/mt5-client/src \
  -c @hey-api/client-fetch
