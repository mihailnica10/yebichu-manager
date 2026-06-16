#!/usr/bin/env python3
"""Bootstrap sync script - pulls assigned config sets from MinIO on first boot.
Called from entrypoint.sh on management and trading instances.
"""
import json
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET

MT5_DIR = os.environ.get("MT5_DIR", "/config/.wine/drive_c/Program Files/MetaTrader 5")
MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "minio:9000")
MINIO_BUCKET = os.environ.get("MINIO_BUCKET", "mt5-configs")
CONFIG_SET_IDS = os.environ.get("CONFIG_SET_IDS", "")

if not CONFIG_SET_IDS:
    print("[SYNC] No config sets assigned, skipping bootstrap")
    sys.exit(0)

set_ids = [x.strip() for x in CONFIG_SET_IDS.split(",") if x.strip()]
print(f"[SYNC] Bootstrap: pulling {len(set_ids)} config sets from MinIO ({MINIO_ENDPOINT})")

for set_id in set_ids:
    try:
        list_url = f"http://{MINIO_ENDPOINT}/{MINIO_BUCKET}/?prefix=config-sets/{set_id}/&list-type=2"
        with urllib.request.urlopen(list_url, timeout=10) as resp:
            xml_data = resp.read().decode()
            root = ET.fromstring(xml_data)
            ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
            keys = []
            for content in root.findall(".//s3:Content", ns):
                key_el = content.find("s3:Key", ns)
                if key_el is not None and key_el.text:
                    keys.append(key_el.text)
            
            versions = set()
            for k in keys:
                parts = k.split("v")
                if len(parts) >= 2:
                    ver = parts[-1].split("/")[0]
                    if ver.isdigit():
                        versions.add(int(ver))
            
            latest = max(versions) if versions else 1
            prefix = f"config-sets/{set_id}/v{latest}/"
            files_written = 0
            
            for key in keys:
                if not key.startswith(prefix):
                    continue
                rel_path = key[len(prefix):]
                target_path = os.path.join(MT5_DIR, rel_path)
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                file_url = f"http://{MINIO_ENDPOINT}/{MINIO_BUCKET}/{key}"
                try:
                    urllib.request.urlretrieve(file_url, target_path)
                    files_written += 1
                except Exception as e:
                    print(f"[SYNC]  Failed: {key} -> {e}")
            
            print(f"[SYNC]  Set #{set_id} v{latest}: {files_written} files written")
    except Exception as e:
        print(f"[SYNC]  Set #{set_id} ERROR: {e}")

print("[SYNC] Bootstrap complete")
