#!/usr/bin/env python3
"""Captures MT5 filesystem state as a tar.gz archive to stdout.

Usage:
  python3 capture_template.py              # outputs tar.gz to stdout
  python3 capture_template.py --list       # lists files that would be captured

Directories captured (relative to CWD):
  config, bases, Profiles, Profiles/Charts, Profiles/Templates,
  Profiles/SymbolSets, Profiles/Tester, MQL5/Experts, MQL5/Presets,
  MQL5/Indicators, MQL5/Scripts, MQL5/Include, MQL5/Libraries,
  MQL5/Images, MQL5/Files, MQL5/Services, Sounds

Excluded files:
  - config/accounts.dat           — account credentials
  - config/servers.dat            — server registry
  - origin*.dat, *plugin*.dat
  - .cfg files inside Config/ or Profiles/ directories
  - *cache*, *.cache
  - bases/*/trades/               — account-specific trade history
  - bases/*/mail/                 — terminal mail
  - bases/*/news/                 — news cache (ephemeral)
  - bases/*/history/              — price history (large, ephemeral)
  - bases/*/ticks/                — tick data (large, ephemeral)
"""

import argparse
import fnmatch
import os
import re
import sys
import tarfile


CAPTURE_PATHS = [
    "config",
    "bases",
    "Profiles",
    "Profiles/Templates",
    "Profiles/SymbolSets",
    "Profiles/Charts",
    "Profiles/Tester",
    "MQL5/Experts",
    "MQL5/Indicators",
    "MQL5/Scripts",
    "MQL5/Include",
    "MQL5/Libraries",
    "MQL5/Images",
    "MQL5/Presets",
    "MQL5/Files",
    "MQL5/Services",
    "Sounds",
]


def should_exclude(arcname: str) -> bool:
    basename = os.path.basename(arcname)

    if arcname == "config/accounts.dat":
        return True
    if arcname == "config/servers.dat":
        return True
    if fnmatch.fnmatch(basename, "origin*.dat"):
        return True
    if fnmatch.fnmatch(basename, "*plugin*.dat"):
        return True
    if fnmatch.fnmatch(basename, "*.cfg"):
        if "/Config/" in arcname or arcname.startswith("Config/") or \
           "/Profiles/" in arcname or arcname.startswith("Profiles/"):
            return True
    if fnmatch.fnmatch(basename, "*cache*") or fnmatch.fnmatch(basename, "*.cache"):
        return True
    if re.search(r"^bases/[^/]+/trades/", arcname):
        return True
    if re.search(r"^bases/[^/]+/mail/", arcname):
        return True
    if re.search(r"^bases/[^/]+/news/", arcname):
        return True
    if re.search(r"^bases/[^/]+/history/", arcname):
        return True
    if re.search(r"^bases/[^/]+/ticks/", arcname):
        return True
    return False





def discover_files(cwd: str):
    files = []
    seen = set()
    for rel_path in CAPTURE_PATHS:
        abs_path = os.path.join(cwd, rel_path)
        if not os.path.isdir(abs_path):
            continue
        for root, _dirs, filenames in os.walk(abs_path):
            for f in filenames:
                fpath = os.path.join(root, f)
                arcname = os.path.relpath(fpath, cwd)
                if arcname in seen:
                    continue
                seen.add(arcname)
                if should_exclude(arcname):
                    continue
                files.append((fpath, arcname))
    return files


def cmd_list(cwd: str):
    files = discover_files(cwd)
    for _, arcname in files:
        print(arcname)


def cmd_archive(cwd: str):
    files = discover_files(cwd)
    total = len(files)

    print(f"Capturing {total} files...", file=sys.stderr)

    with tarfile.open(fileobj=sys.stdout.buffer, mode="w:gz") as tar:
        for idx, (fpath, arcname) in enumerate(files, 1):
            try:
                tar.add(fpath, arcname=arcname)
            except (OSError, PermissionError) as e:
                print(f"  [{idx}/{total}] SKIP {arcname}: {e}", file=sys.stderr)
                continue
            print(f"  [{idx}/{total}] {arcname}", file=sys.stderr)

    print(f"Done — {total} files archived.", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Capture MT5 files as tar.gz")
    parser.add_argument("--list", action="store_true", help="List files without creating archive")
    args = parser.parse_args()

    cwd = os.getcwd()

    if args.list:
        cmd_list(cwd)
    else:
        cmd_archive(cwd)


if __name__ == "__main__":
    main()
