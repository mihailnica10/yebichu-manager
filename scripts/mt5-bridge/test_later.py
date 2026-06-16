import json
from rpa import click_later, list_windows, find_mt5_windows

print("=== BEFORE CLICK LATER ===")
mt5 = find_mt5_windows()
for w in mt5:
    print("  [%d] %s" % (w["id"], w["name"]))
windows = list_windows()
for w in windows:
    if w["id"] not in [x["id"] for x in mt5]:
        print("  [%d] %s" % (w["id"], w["name"]))

print()
print("=== CLICKING LATER ===")
result = click_later()
print(json.dumps(result, indent=2))

print()
print("=== AFTER CLICK LATER ===")
windows = list_windows()
for w in windows:
    print("  [%d] %s" % (w["id"], w["name"][:60]))
