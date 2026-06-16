import os
import subprocess
import logging

logger = logging.getLogger("rpa")

DISPLAY = os.environ.get("DISPLAY", ":1")
ENV = {**os.environ, "DISPLAY": DISPLAY}

def _xdo(*args: str) -> str:
    try:
        r = subprocess.run(["xdotool"] + list(args), capture_output=True, text=True, timeout=15, env=ENV)
        return r.stdout.strip()
    except subprocess.TimeoutExpired:
        logger.warning("xdotool timeout: %s", args)
        return ""
    except FileNotFoundError:
        logger.error("xdotool not found")
        return ""

def _xdo_search(name: str = "") -> list[int]:
    out = _xdo("search", "--name", name)
    if not out:
        return []
    return [int(w) for w in out.split() if w.strip().isdigit()]

def _xdo_get_name(wid: int) -> str:
    return _xdo("getwindowname", str(wid))

def _xdo_get_geometry(wid: int) -> dict:
    out = _xdo("getwindowgeometry", "--shell", str(wid))
    if not out:
        return {}
    d = {}
    for line in out.split("\n"):
        if "=" in line:
            k, v = line.split("=", 1)
            d[k.strip()] = v.strip()
    return d

def _xdo_type(text: str, delay: int = 50) -> bool:
    r = _xdo("type", "--delay", str(delay), text)
    return bool(r) or r == ""

def _xdo_key(key: str) -> bool:
    r = _xdo("key", key)
    return bool(r) or r == ""


def _xdo_click(client_x: int, client_y: int, window_name: str = "MetaTrader 5") -> bool:
    """Click at window-relative coordinates using xdotool (reliable under Xvnc)."""
    ids = _xdo_search(window_name)
    if not ids:
        return False
    wid = ids[0]
    _xdo("windowactivate", "--sync", str(wid))
    _xdo("mousemove", "--window", str(wid), str(client_x), str(client_y), "click", "1")
    return True
