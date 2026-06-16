import json
from rpa import list_windows, find_mt5_windows, focus_mt5

print("=== ALL WINDOWS ===")
windows = list_windows()
for w in windows[:30]:
    print("  [%d] %-60s (%sx%s)" % (w["id"], w["name"][:60], w["width"], w["height"]))
print("  ... (%d total)" % len(windows))

print()
print("=== MT5 WINDOWS ===")
mt5 = find_mt5_windows()
for w in mt5:
    print("  [%d] %s" % (w["id"], w["name"]))

print()
print("=== FOCUS MT5 ===")
print(json.dumps(focus_mt5(), indent=2))
