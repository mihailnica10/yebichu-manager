#!/usr/bin/env python3
"""Generate OpenAPI spec from the FastAPI app."""
import json
import sys
sys.path.insert(0, ".")
from main import app

spec = app.openapi()
with open("openapi.json", "w") as f:
    json.dump(spec, f, indent=2)
print(f"OpenAPI spec written to openapi.json ({len(json.dumps(spec))} bytes)")
