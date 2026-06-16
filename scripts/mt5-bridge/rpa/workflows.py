import logging
import json
import subprocess
import threading
import time

from .engine import _xdo, _xdo_key, _xdo_click
from .windows import list_windows
from .screenshot import _screenshot, _ocr, _parse_brokers, _screenshot_area

logger = logging.getLogger("rpa.workflows")

WINE_RPA = ["wine", "python", "/mt5-bridge/wine_rpa.py"]


def _wine_cmd(action: str, **kwargs) -> dict:
    """Run a single wine_rpa command and return the result dict."""
    payload = {"action": action, **kwargs}
    try:
        r = subprocess.run(
            WINE_RPA,
            input=json.dumps(payload),
            capture_output=True, text=True, timeout=30,
        )
        return json.loads(r.stdout.strip())
    except Exception as e:
        return {"status": "error", "detail": str(e)}


# ---------------------------------------------------------------------------
# LiveUpdate Dismiss Workflow
# ---------------------------------------------------------------------------


def dismiss_liveupdate() -> dict:
    """Dismiss LiveUpdate/Welcome dialogs (separate X11 windows)."""
    windows = list_windows()
    liveupdate = [w for w in windows if "LiveUpdate" in w["name"] or "Welcome" in w["name"]]
    if not liveupdate:
        return {"status": "not_found"}

    wid = liveupdate[0]["id"]
    _xdo("windowactivate", str(wid))
    time.sleep(0.5)
    _xdo("windowfocus", str(wid))
    time.sleep(0.2)
    _xdo_key("alt+n")
    time.sleep(0.3)
    _xdo_key("Return")
    time.sleep(0.5)

    still_open = [w for w in list_windows() if w["id"] == wid]
    return {
        "status": "dismissed" if not still_open else "failed",
        "window": liveupdate[0]["name"],
    }


def run_liveupdate_watchdog(interval: float = 15.0) -> None:
    logger.info("liveupdate watchdog started (interval=%ss)", interval)
    while True:
        try:
            result = dismiss_liveupdate()
            if result["status"] == "dismissed":
                logger.info("dismissed LiveUpdate dialog: %s", result.get("window"))
        except Exception as e:
            logger.warning("liveupdate watchdog error: %s", e)
        time.sleep(interval)


def start_liveupdate_watchdog(interval: float = 15.0) -> threading.Thread:
    t = threading.Thread(target=run_liveupdate_watchdog, args=(interval,), daemon=True)
    t.start()
    logger.info("liveupdate watchdog thread started")
    return t


# ---------------------------------------------------------------------------
# Broker Search Workflow
# ---------------------------------------------------------------------------


def open_account_dialog() -> dict:
    """Open File > Open an Account via wine_rpa mouse clicks. Check with OCR."""
    result = _wine_cmd("menu_open_account")
    if result.get("status") != "ok":
        return {"status": "error", "detail": result.get("detail", "wine_rpa_error")}

    # Verify dialog opened via OCR
    time.sleep(1)
    path, text = _screenshot_and_ocr_area(0, 50, 320, 500)
    if "Select a company" in text or "Find your company" in text:
        return {"status": "opened"}
    return {"status": "failed", "reason": "dialog_not_verified"}


def search_broker(query: str) -> dict:
    """
    Search broker in MT5's Open an Account dialog.
    1. Open dialog via xdotool mouse clicks
    2. Set search text via wine_rpa (EM_REPLACESEL)
    3. Click "Find your company" button via wine_rpa
    4. Screenshot & crop the dialog area
    5. OCR and parse broker names
    """
    # Step 1: Open dialog
    _xdo_click(30, 20)     # File menu
    time.sleep(0.8)
    _xdo_click(80, 220)    # Open an Account
    time.sleep(3.0)

    # Step 2: Search via wine_rpa
    search = _wine_cmd("dialog_search", query=query)
    if search.get("status") != "ok":
        return {"status": "error", "detail": "search_failed"}

    time.sleep(1.0)

    # Step 3: Get dialog rect and crop
    dr = [289, 100, 991, 650]  # known dialog rect
    crop_x, crop_y = dr[0], dr[1]
    crop_w, crop_h = dr[2] - dr[0], dr[3] - dr[1]

    screenshot_path = f"/tmp/broker-search-{int(time.time() * 1000)}.png"
    _screenshot(screenshot_path)
    cropped_path = f"/tmp/cropped-{int(time.time() * 1000)}.png"
    _screenshot_area(screenshot_path, cropped_path, crop_x, crop_y, crop_w, crop_h)
    ocr_text = _ocr(cropped_path, psm=3)
    brokers = _parse_brokers(ocr_text)

    return {
        "status": "complete",
        "query": query,
        "screenshot": cropped_path,
        "ocr_text": ocr_text,
        "brokers": brokers,
    }


# ---------------------------------------------------------------------------
# Sign-In Workflow
# ---------------------------------------------------------------------------


def open_login_dialog() -> dict:
    """Open File > Login to Trade Account via wine_rpa mouse clicks."""
    result = _wine_cmd("menu_login")
    if result.get("status") == "opened":
        return {"status": "opened"}
    # Try once more
    time.sleep(1)
    result = _wine_cmd("menu_login")
    return {"status": "opened" if result.get("status") == "opened" else "failed"}


def sign_in_to_account(login: str, password: str, server: str) -> dict:
    """Sign in via the Login dialog using wine_rpa keyboard typing."""
    dialog = open_login_dialog()
    if dialog["status"] != "opened":
        return {"status": "error", "detail": "login_dialog_not_opened"}

    _wine_cmd("type_text", text=login)
    time.sleep(0.2)
    _wine_cmd("key", key="tab")
    time.sleep(0.2)
    _wine_cmd("type_text", text=password)
    time.sleep(0.2)
    _wine_cmd("key", key="tab")
    time.sleep(0.2)
    _wine_cmd("type_text", text=server)
    time.sleep(0.3)
    _wine_cmd("key", key="enter")
    time.sleep(2.0)

    return {"status": "sign_in_submitted", "login": login, "server": server}


# ---------------------------------------------------------------------------
# Server Discovery Workflow
# ---------------------------------------------------------------------------


def _open_dialog_via_xdo():
    """Open the dialog using xdotool (reliable window-relative clicks)."""
    _xdo_click(30, 20)    # Click File menu
    time.sleep(0.8)
    _xdo_click(80, 220)   # Click Open an Account
    time.sleep(3.0)
    dlg = _wine_cmd("dialog_open")
    return dlg


def discover_servers(broker: str) -> dict:
    """
    Discover available servers for a broker.
    
    Steps:
    1. Cancel any existing dialog (cleanup)
    2. Open the Open an Account dialog
    3. Search for the broker by name
    4. Wait for results
    5. Select the first result
    6. Click Next to go to Step 2
    7. Read the Server ComboBox
    8. Cancel the dialog (cleanup)
    9. Return server list
    """
    # Cleanup first
    _wine_cmd("dialog_cancel")
    time.sleep(0.5)

    # Step 1: Open dialog via xdotool (reliable)
    dlg = _open_dialog_via_xdo()
    if dlg.get("status") != "opened":
        return {"status": "error", "detail": dlg.get("detail", "open_failed")}

    # Step 2: Search
    search = _wine_cmd("dialog_search", query=broker)
    if search.get("status") != "ok":
        return {"status": "error", "detail": "search_failed"}
    time.sleep(1.0)

    # Step 3: Select first result
    sel = _wine_cmd("dialog_select", index=0)
    if sel.get("status") != "ok":
        return {"status": "error", "detail": "select_failed"}
    time.sleep(0.5)

    # Step 4: Click Next
    nxt = _wine_cmd("dialog_next")
    if nxt.get("status") != "ok":
        _wine_cmd("dialog_cancel")
        return {"status": "error", "detail": "next_failed"}
    time.sleep(1.0)

    # Step 5: Read servers
    servers_r = _wine_cmd("dialog_servers")
    servers = []
    if servers_r.get("status") == "ok":
        for group in servers_r.get("servers", []):
            servers.extend(group.get("servers", []))

    # Cleanup: cancel dialog
    time.sleep(0.3)
    _wine_cmd("dialog_cancel")

    return {
        "status": "ok",
        "broker": broker,
        "servers": servers,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _screenshot_and_ocr_area(x, y, w, h):
    """Take screenshot, crop area, OCR, return (path, text)."""
    full = f"/tmp/rpa-full-{int(time.time() * 1000)}.png"
    crop = f"/tmp/rpa-crop-{int(time.time() * 1000)}.png"
    _screenshot(full)
    _screenshot_area(full, crop, x, y, w, h)
    text = _ocr(crop, psm=3)
    return crop, text
