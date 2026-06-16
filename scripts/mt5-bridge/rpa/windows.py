import time

from .engine import _xdo, _xdo_search, _xdo_get_name, _xdo_get_geometry, _xdo_key


def list_windows() -> list[dict]:
    all_ids = _xdo_search("")
    windows = []
    for wid in all_ids:
        name = _xdo_get_name(wid)
        if not name:
            continue
        geom = _xdo_get_geometry(wid)
        windows.append({
            "id": wid,
            "name": name,
            "x": geom.get("X"),
            "y": geom.get("Y"),
            "width": geom.get("WIDTH"),
            "height": geom.get("HEIGHT"),
        })
    return windows


def find_mt5_windows() -> list[dict]:
    windows = list_windows()
    mt5 = [w for w in windows if "MetaTrader 5" in w["name"] or "MetaEditor" in w["name"]]
    return mt5


def focus_mt5() -> dict:
    ids = _xdo_search(".*MetaTrader 5.*")
    if not ids:
        ids = _xdo_search("terminal64")
    if not ids:
        raise RuntimeError("MT5 window not found")
    wid = ids[0]
    _xdo("windowactivate", str(wid))
    time.sleep(0.3)
    name = _xdo_get_name(wid)
    geom = _xdo_get_geometry(wid)
    return {
        "status": "focused",
        "window_id": wid,
        "title": name,
        "width": geom.get("WIDTH"),
        "height": geom.get("HEIGHT"),
    }


def click_later() -> dict:
    focus_mt5()
    time.sleep(0.5)
    _xdo_key("alt+n")
    time.sleep(0.5)
    _xdo_key("Return")
    time.sleep(0.3)
    return {"status": "clicked_later"}
