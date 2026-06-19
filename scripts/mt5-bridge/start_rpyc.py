import rpyc
from rpyc.utils.server import ThreadedServer
from rpyc import SlaveService
import sys
import logging

port = int(sys.argv[1]) if len(sys.argv) > 1 else 18812
host = sys.argv[2] if len(sys.argv) > 2 else "0.0.0.0"

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("rpyc-server")

logger.info("Starting rpyc SlaveService on %s:%s", host, port)

# Pre-import modules that trigger ucrtbase complex math (crealf) to catch
# potential crashes at server startup rather than on first client connect.
try:
    import numpy
    logger.info("numpy %s pre-loaded successfully", numpy.__version__)
except Exception as e:
    logger.warning("numpy pre-load failed: %s", e)

try:
    import MetaTrader5
    logger.info("MetaTrader5 pre-loaded successfully")
except Exception as e:
    logger.warning("MetaTrader5 pre-load failed: %s", e)

try:
    server = ThreadedServer(
        SlaveService,
        hostname=host,
        port=port,
        protocol_config={
            "sync_request_timeout": 120,
            "allow_pickle": True,
            "allow_public_attrs": True,
            "allow_all_attrs": True,
        },
    )
    logger.info("rpyc server ready")
    server.start()
except Exception as e:
    logger.exception("rpyc server failed: %s", e)
    sys.exit(1)
