import json
from rpa import search_broker

print("=== SEARCHING BROKER ===")
result = search_broker("IC Markets")
print(json.dumps(result, indent=2))
print()
print("=== OCR RAW ===")
print(result.get("ocr_text", "")[:2000])
