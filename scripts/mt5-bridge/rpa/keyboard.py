import time

from .engine import _xdo, _xdo_search, _xdo_key, _xdo_type
from .windows import click_later
from .screenshot import _screenshot


def execute_sequence(sequence: list[dict]) -> dict:
    actions_run = 0
    for step in sequence:
        action = step.get("action_type", "")
        payload = step.get("payload", "")
        if action == "focus":
            ids = _xdo_search(payload)
            if ids:
                _xdo("windowactivate", str(ids[0]))
                time.sleep(0.3)
        elif action == "key":
            _xdo_key(payload)
            time.sleep(0.1)
        elif action == "type":
            _xdo_type(payload, delay=30)
        elif action == "wait":
            time.sleep(float(payload))
        elif action == "later":
            click_later()
        elif action == "screenshot":
            path = payload or f"/tmp/rpa-screen-{int(time.time())}.png"
            _screenshot(path)
        actions_run += 1
    return {"status": "success", "executed_actions": actions_run}
