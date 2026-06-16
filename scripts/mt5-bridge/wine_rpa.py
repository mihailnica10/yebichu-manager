#!/usr/bin/env wine python
"""
Wine RPA Agent — runs under Wine Python, handles Win32 GUI operations via JSON stdin/stdout.
Does NOT handle screenshots or OCR (those run from Linux Python).
"""
import json
import sys
import time
import traceback
import win32gui
import win32con
import win32api


def _key(vk, delay=0.05):
    win32api.keybd_event(vk, 0, 0, 0)
    time.sleep(delay)
    win32api.keybd_event(vk, 0, win32con.KEYEVENTF_KEYUP, 0)
    time.sleep(delay)


def _mouse_click(x, y):
    win32api.SetCursorPos((x, y))
    time.sleep(0.1)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.05)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    time.sleep(0.3)


def _enum_windows():
    result = []
    def cb(h, r):
        t = win32gui.GetWindowText(h)
        if t.strip():
            r.append({"hwnd": h, "title": t.strip(), "class": win32gui.GetClassName(h)})
        return True
    win32gui.EnumWindows(cb, result)
    return result


def _find_mt5():
    for w in _enum_windows():
        if "MetaTrader" in w["title"] and "MetaQuotes" in w["class"]:
            return w
    return None


def _focus_mt5(hwnd):
    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
    win32gui.SetForegroundWindow(hwnd)
    time.sleep(0.5)


def _close_menus(hwnd):
    _focus_mt5(hwnd)
    for _ in range(3):
        _key(win32con.VK_ESCAPE)
        time.sleep(0.1)
    time.sleep(0.3)


# --- Command Handlers ---

def cmd_focus(payload):
    mt5 = _find_mt5()
    if not mt5:
        return {"status": "error", "detail": "MT5 not found"}
    _focus_mt5(mt5["hwnd"])
    rect = win32gui.GetWindowRect(mt5["hwnd"])
    return {"status": "ok", "hwnd": mt5["hwnd"], "title": mt5["title"], "rect": list(rect)}


def cmd_list_windows(payload):
    return {"windows": _enum_windows()}


def cmd_mt5_rect(payload):
    mt5 = _find_mt5()
    if not mt5:
        return {"status": "error", "detail": "MT5 not found"}
    rect = win32gui.GetWindowRect(mt5["hwnd"])
    return {"rect": list(rect), "hwnd": mt5["hwnd"]}


def cmd_key(payload):
    pl = payload or {}
    key_name = pl.get("key", "").lower()
    KEY_MAP = {
        "tab": win32con.VK_TAB, "return": win32con.VK_RETURN, "enter": win32con.VK_RETURN,
        "escape": win32con.VK_ESCAPE, "esc": win32con.VK_ESCAPE,
        "down": win32con.VK_DOWN, "up": win32con.VK_UP,
        "left": win32con.VK_LEFT, "right": win32con.VK_RIGHT,
        "space": win32con.VK_SPACE,
        "f1": win32con.VK_F1, "f5": win32con.VK_F5,
        "delete": win32con.VK_DELETE, "backspace": win32con.VK_BACK,
    }
    vk = KEY_MAP.get(key_name)
    if vk:
        _key(vk)
    elif len(key_name) == 1:
        _key(ord(key_name.upper()))
    else:
        try:
            _key(int(key_name))
        except (ValueError, TypeError):
            return {"status": "error", "detail": "unknown key: " + key_name}
    return {"status": "ok"}


def cmd_type_text(payload):
    text = (payload or {}).get("text", "")
    for ch in text:
        if ch == ' ':
            _key(win32con.VK_SPACE, 0.02)
        elif ch == '\t':
            _key(win32con.VK_TAB, 0.02)
        elif ch == '\n':
            _key(win32con.VK_RETURN, 0.02)
        elif ch.isupper():
            win32api.keybd_event(win32con.VK_SHIFT, 0, 0, 0)
            time.sleep(0.02)
            _key(ord(ch.upper()), 0.02)
            release_keys()
            time.sleep(0.01)
        else:
            _key(ord(ch.upper()), 0.02)
        time.sleep(0.03)
    return {"status": "ok"}


def cmd_click(payload):
    """Click at pixel coordinates (screen)."""
    pl = payload or {}
    x = pl.get("x", 0)
    y = pl.get("y", 0)
    _mouse_click(x, y)
    return {"status": "clicked", "x": x, "y": y}


OX, OY = 9, 59  # X11 window frame offset

def _file_menu_coords():
    """Screen coordinates for File menu items.
    MT5 X11 window at (9, 59), Win32 client at (0, 0, 1280, 720).
    Menu items are at client positions relative to window origin."""
    return {
        "file": (OX + 30, OY + 20),
        "open_account": (OX + 80, OY + 220),
        "login": (OX + 80, OY + 180),
    }


def cmd_menu_open_account(payload):
    """Open File > Open an Account using mouse clicks (win32 SetCursorPos + mouse_event)."""
    mt5 = _find_mt5()
    if not mt5:
        return {"status": "error", "detail": "MT5 not found"}
    _close_menus(mt5["hwnd"])
    coords = _file_menu_coords()

    _mouse_click(*coords["file"])
    time.sleep(0.8)
    _mouse_click(*coords["open_account"])
    time.sleep(3.0)

    return {"status": "ok"}


def cmd_menu_login(payload):
    """Open File > Login to Trade Account using mouse clicks."""
    mt5 = _find_mt5()
    if not mt5:
        return {"status": "error", "detail": "MT5 not found"}
    _close_menus(mt5["hwnd"])
    coords = _file_menu_coords()

    _mouse_click(*coords["file"])
    time.sleep(0.8)
    _mouse_click(*coords["login"])
    time.sleep(3.0)

    for w in _enum_windows():
        if w["class"] == "#32770" and w["title"] in ("Login", "Connection"):
            return {"status": "opened", "title": w["title"]}

    return {"status": "ok"}


# --- Dialog constants ---
DIALOG_RECT = [289, 100, 991, 650]


def _find_dialog():
    """Find the Open an Account #32770 dialog."""
    def cb(h, r):
        c = win32gui.GetClassName(h)
        if c == "#32770":
            rect = win32gui.GetWindowRect(h)
            if rect[2] - rect[0] > 500:
                r.append((h, rect))
        return True
    dialogs = []
    win32gui.EnumWindows(cb, dialogs)
    if dialogs:
        return dialogs[0]
    return None


def _dialog_get_ctrl(dialog_hwnd, class_name, text_filter=None):
    """Find a child control by class name and optional text."""
    results = []
    def cb(h, r):
        c = win32gui.GetClassName(h)
        t = win32gui.GetWindowText(h)
        if c == class_name and (text_filter is None or text_filter in t):
            r.append((h, c, t))
        return True
    win32gui.EnumChildWindows(dialog_hwnd, cb, results)
    return results


def _dialog_send_text(edit_hwnd, text):
    """Set Edit control text via EM_SETSEL + EM_REPLACESEL."""
    EM_SETSEL = 0x00B1
    EM_REPLACESEL = 0x00C2
    import ctypes
    win32gui.SendMessage(edit_hwnd, EM_SETSEL, 0, -1)
    buf = ctypes.create_unicode_buffer(text)
    win32gui.SendMessage(edit_hwnd, EM_REPLACESEL, 0, ctypes.addressof(buf))


def cmd_dialog_open(pl=None):
    """Open the Open an Account dialog. Uses menu_open_account (mouse clicks via win32),
    then checks for dialog appearance."""
    r = cmd_menu_open_account(pl)
    time.sleep(1.5)
    dlg = _find_dialog()
    if dlg:
        return {"status": "opened", "dialog_hwnd": dlg[0], "rect": list(dlg[1])}
    return {"status": "error", "detail": "dialog not found"}


def cmd_dialog_search(pl=None):
    """Search for a broker: set text + click Find, return OCR data."""
    query = (pl or {}).get("query", "")
    dlg = _find_dialog()
    if not dlg:
        return {"status": "error", "detail": "dialog not open"}

    hwnd = dlg[0]
    # Find Edit and set text
    edits = _dialog_get_ctrl(hwnd, "Edit")
    if edits and query:
        _dialog_send_text(edits[0][0], query)
        time.sleep(0.3)

    # Click Find your company
    buttons = _dialog_get_ctrl(hwnd, "Button", "Find")
    if buttons:
        win32gui.SendMessage(buttons[0][0], win32con.BM_CLICK, 0, 0)
        time.sleep(2.0)

    return {"status": "ok", "query": query, "dialog_hwnd": hwnd}


def cmd_dialog_select(pl=None):
    """Select a broker by index (Down key presses)."""
    idx = (pl or {}).get("index", 0)
    dlg = _find_dialog()
    if not dlg:
        return {"status": "error", "detail": "dialog not open"}

    listviews = _dialog_get_ctrl(dlg[0], "SysListView32")
    if not listviews:
        return {"status": "error", "detail": "listview not found"}
    lv_hwnd = listviews[0][0]

    # Focus the listview and navigate
    win32gui.SetFocus(lv_hwnd)
    time.sleep(0.2)

    # Send Down key `idx+1` times to select item at index
    LVM_SETITEMSTATE = 0x100B
    LVIS_SELECTED = 0x0002
    LVIS_FOCUSED = 0x0001

    # Clear selection first
    ctypes.pythonapi.PyCapsule_New  # ensure ctypes imported
    import ctypes
    class LVITEM(ctypes.Structure):
        _pack_ = 8
        _fields_ = [
            ("mask", ctypes.c_uint),
            ("iItem", ctypes.c_int),
            ("iSubItem", ctypes.c_int),
            ("state", ctypes.c_uint),
            ("stateMask", ctypes.c_uint),
            ("pszText", ctypes.c_void_p),
            ("cchTextMax", ctypes.c_int),
            ("iImage", ctypes.c_int),
            ("lParam", ctypes.c_longlong),
            ("iIndent", ctypes.c_int),
        ]

    # Select and focus item at idx
    item = LVITEM(LVIS_SELECTED, idx, 0, LVIS_SELECTED | LVIS_FOCUSED, 0xFFFF, 0, 0, 0, 0, 0)
    win32gui.SendMessage(lv_hwnd, LVM_SETITEMSTATE, -1, ctypes.addressof(item))
    LVM_ENSUREVISIBLE = 0x1013
    win32gui.SendMessage(lv_hwnd, LVM_ENSUREVISIBLE, idx, 0)
    time.sleep(0.3)

    return {"status": "ok", "selected_index": idx}


def cmd_dialog_next(pl=None):
    """Click the Next > button."""
    dlg = _find_dialog()
    if not dlg:
        return {"status": "error", "detail": "dialog not open"}
    buttons = _dialog_get_ctrl(dlg[0], "Button", "Next")
    if buttons:
        win32gui.SendMessage(buttons[0][0], win32con.BM_CLICK, 0, 0)
        time.sleep(1.5)
        return {"status": "ok"}
    return {"status": "error", "detail": "Next button not found"}


def cmd_dialog_back(pl=None):
    """Click the < Back button."""
    dlg = _find_dialog()
    if not dlg:
        return {"status": "error", "detail": "dialog not open"}
    buttons = _dialog_get_ctrl(dlg[0], "Button", "Back")
    if buttons:
        win32gui.SendMessage(buttons[0][0], win32con.BM_CLICK, 0, 0)
        time.sleep(1.0)
        return {"status": "ok"}
    return {"status": "error", "detail": "Back button not found"}


def cmd_dialog_cancel(pl=None):
    """Cancel and close the dialog."""
    dlg = _find_dialog()
    if dlg:
        btn_cancel = _dialog_get_ctrl(dlg[0], "Button", "Cancel")
        if btn_cancel:
            win32gui.SendMessage(btn_cancel[0][0], win32con.BM_CLICK, 0, 0)
        else:
            win32gui.PostMessage(dlg[0], win32con.WM_CLOSE, 0, 0)
        time.sleep(1.0)
    return {"status": "closed"}


def cmd_dialog_servers(pl=None):
    """
    Get server list from Step 2 (after Next).
    The Server ComboBox on the Login option contains available servers.
    """
    dlg = _find_dialog()
    if not dlg:
        return {"status": "error", "detail": "dialog not open"}

    hwnd = dlg[0]
    combos = _dialog_get_ctrl(hwnd, "ComboBox")
    if not combos:
        return {"status": "error", "detail": "no combobox found (are you on Step 2?)"}

    # The server ComboBox is usually the one with items
    results = []
    CB_GETCOUNT = 0x0146
    CB_GETLBTEXTLEN = 0x0149
    CB_GETLBTEXT = 0x0148

    for combo_hwnd, _, _ in combos:
        count = win32gui.SendMessage(combo_hwnd, CB_GETCOUNT, 0, 0)
        if count > 0:
            servers = []
            for i in range(count):
                try:
                    length = win32gui.SendMessage(combo_hwnd, CB_GETLBTEXTLEN, i, 0)
                    if length > 0 and length < 500:
                        buf = ctypes.create_unicode_buffer(length + 1)
                        win32gui.SendMessage(combo_hwnd, CB_GETLBTEXT, i, ctypes.addressof(buf))
                        if buf.value:
                            servers.append(buf.value.strip())
                except:
                    pass
            if servers:
                results.append({"servers": servers})

    return {"status": "ok", "servers": results}


def cmd_dialog_state(pl=None):
    """Get current dialog state: controls, buttons, step info."""
    dlg = _find_dialog()
    if not dlg:
        return {"status": "no_dialog"}

    hwnd = dlg[0]
    state = {"hwnd": hwnd, "rect": list(dlg[1])}

    edits = _dialog_get_ctrl(hwnd, "Edit")
    state["edit_count"] = len(edits)

    buttons = _dialog_get_ctrl(hwnd, "Button")
    visible_buttons = []
    for h, c, t in buttons:
        if win32gui.IsWindowVisible(h):
            visible_buttons.append(t[:40])
    state["visible_buttons"] = visible_buttons

    combos = _dialog_get_ctrl(hwnd, "ComboBox")
    state["combo_count"] = len(combos)

    listviews = _dialog_get_ctrl(hwnd, "SysListView32")
    if listviews:
        LVM_GETITEMCOUNT = 0x1004
        state["list_items"] = win32gui.SendMessage(listviews[0][0], LVM_GETITEMCOUNT, 0, 0)

    return {"status": "ok", "dialog": state}


def cmd_ocr_search_broker(payload):
    """
    Full broker search workflow: open dialog, type query, click Find, return coordinates.
    The dialog is at rect (289, 100, 991, 650) within the MT5 window.
    """
    # Step 1: Open menu
    result = cmd_menu_open_account(payload)
    if result["status"] != "ok":
        return result
    time.sleep(1.0)

    # Step 2: Find the dialog window
    dialog_hwnd = None
    def cb(h, r):
        nonlocal dialog_hwnd
        t = win32gui.GetWindowText(h)
        c = win32gui.GetClassName(h)
        if c == "#32770":
            rect = win32gui.GetWindowRect(h)
            if rect[2] - rect[0] > 500:  # Large dialog
                dialog_hwnd = h
        return True
    win32gui.EnumWindows(cb, None)

    if dialog_hwnd:
        # Step 3: Find Edit control and set text
        def find_edit(h, r):
            if win32gui.GetClassName(h) == "Edit":
                r.append(h)
            return True
        edits = []
        win32gui.EnumChildWindows(dialog_hwnd, find_edit, edits)

        query = (payload or {}).get("query", "")
        if edits and query:
            hwnd_edit = edits[0]
            EM_SETSEL = 0x00B1
            EM_REPLACESEL = 0x00C2
            import ctypes
            win32gui.SendMessage(hwnd_edit, EM_SETSEL, 0, -1)
            buf = ctypes.create_unicode_buffer(query)
            win32gui.SendMessage(hwnd_edit, EM_REPLACESEL, 0, ctypes.addressof(buf))
            time.sleep(0.5)

            # Step 4: Click "Find your company"
            def find_button(h, r):
                t = win32gui.GetWindowText(h)
                if t and "Find" in t:
                    r.append(h)
                return True
            buttons = []
            win32gui.EnumChildWindows(dialog_hwnd, find_button, buttons)
            if buttons:
                win32gui.SendMessage(buttons[0], win32con.BM_CLICK, 0, 0)
                time.sleep(2.0)

        rect = win32gui.GetWindowRect(dialog_hwnd)
    else:
        rect = [289, 100, 991, 650]  # Fallback coords

    return {
        "status": "ok",
        "query": (payload or {}).get("query", ""),
        "dialog_rect": list(rect),
    }


def cmd_dismiss_liveupdate(payload):
    for w in _enum_windows():
        if "LiveUpdate" in w["title"] or "Welcome" in w["title"]:
            _focus_mt5(w["hwnd"])
            time.sleep(0.3)
            _key(ord("N"))
            time.sleep(0.3)
            _key(win32con.VK_RETURN)
            time.sleep(0.5)
            return {"status": "dismissed", "title": w["title"]}
    return {"status": "not_found"}


def cmd_list_children(payload):
    """List all child windows of MT5."""
    mt5 = _find_mt5()
    if not mt5:
        return {"status": "error", "detail": "MT5 not found"}
    hwnd = mt5["hwnd"]
    children = []
    def cb(h, r):
        t = win32gui.GetWindowText(h)
        c = win32gui.GetClassName(h)
        visible = win32gui.IsWindowVisible(h)
        r.append({"hwnd": h, "title": t.strip()[:40], "class": c, "visible": visible})
        return True
    win32gui.EnumChildWindows(hwnd, cb, children)
    return {"children": children}


HANDLERS = {
    "focus": cmd_focus,
    "list_windows": cmd_list_windows,
    "mt5_rect": cmd_mt5_rect,
    "key": cmd_key,
    "type_text": cmd_type_text,
    "click": cmd_click,
    "menu_open_account": cmd_menu_open_account,
    "menu_login": cmd_menu_login,
    "dismiss_liveupdate": cmd_dismiss_liveupdate,
    "list_children": cmd_list_children,
    "ocr_search_broker": cmd_ocr_search_broker,
    "dialog_open": cmd_dialog_open,
    "dialog_search": cmd_dialog_search,
    "dialog_select": cmd_dialog_select,
    "dialog_next": cmd_dialog_next,
    "dialog_back": cmd_dialog_back,
    "dialog_cancel": cmd_dialog_cancel,
    "dialog_servers": cmd_dialog_servers,
    "dialog_state": cmd_dialog_state,
}


def release_keys():
    """Release any pressed modifier keys."""
    for vk in [win32con.VK_SHIFT, win32con.VK_CONTROL, win32con.VK_MENU]:
        win32api.keybd_event(vk, 0, win32con.KEYEVENTF_KEYUP, 0)


if __name__ == "__main__":
    sys.stdout.reconfigure(line_buffering=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            time.sleep(0.05)
            continue
        try:
            cmd = json.loads(line)
            action = cmd.get("action", "")
            handler = HANDLERS.get(action)
            if handler:
                result = handler(cmd)
            else:
                result = {"status": "error", "detail": "unknown action: " + action}
            print(json.dumps(result), flush=True)
        except Exception as e:
            print(json.dumps({"status": "error", "detail": str(e), "trace": traceback.format_exc()}), flush=True)
