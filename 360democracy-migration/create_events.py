#!/usr/bin/env python3
"""Recreate Circle events as Discourse event topics through the Discourse API.

Reads events.csv (title, start, end, timezone, category_id, description, url, allowed_groups,
status) and creates one topic per row with a [event] block from the bundled discourse-events
plugin. The Zoom link goes in the event's url attribute, which the plugin shows only to people
who can see the topic.

    python3 create_events.py events.csv --site https://community.example.org \
        --api-key "$DISCOURSE_API_KEY" --api-user system

    python3 create_events.py events.csv --dry-run      # print the payloads, create nothing
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

FIELDS = ["title", "start", "end", "timezone", "category_id", "description", "url", "allowed_groups", "status"]


def event_raw(row: dict[str, str]) -> str:
    """Build the post body: an [event] block followed by the description."""
    attrs = {
        "start": row["start"].strip(),
        "end": row.get("end", "").strip(),
        "timezone": row.get("timezone", "").strip() or "Europe/Brussels",
        "status": row.get("status", "").strip() or "private",
        "name": row["title"].strip(),
        "url": row.get("url", "").strip(),
        "allowedGroups": row.get("allowed_groups", "").strip(),
    }
    parts = [f'{key}="{value}"' for key, value in attrs.items() if value]
    body = f"[event {' '.join(parts)}]\n[/event]"
    description = row.get("description", "").strip()
    return f"{body}\n\n{description}" if description else body


def payload(row: dict[str, str]) -> dict:
    missing = [f for f in ("title", "start", "category_id") if not row.get(f, "").strip()]
    if missing:
        raise ValueError(f"event {row.get('title')!r}: missing {missing}")
    return {
        "title": row["title"].strip(),
        "raw": event_raw(row),
        "category": int(row["category_id"]),
    }


def create_topic(site: str, api_key: str, api_user: str, data: dict) -> dict:
    request = urllib.request.Request(
        f"{site.rstrip('/')}/posts.json",
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json", "Api-Key": api_key, "Api-Username": api_user},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f"{data['title']}: HTTP {error.code} {error.read().decode(errors='replace')}") from error


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("events_csv", type=Path)
    parser.add_argument("--site", help="https://community.example.org")
    parser.add_argument("--api-key")
    parser.add_argument("--api-user", default="system")
    parser.add_argument("--dry-run", action="store_true", help="print payloads instead of creating topics")
    args = parser.parse_args(argv)

    with args.events_csv.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    payloads = [payload(row) for row in rows]

    if args.dry_run:
        print(json.dumps(payloads, indent=2, ensure_ascii=False))
        return 0
    if not (args.site and args.api_key):
        parser.error("--site and --api-key are required unless --dry-run")
    for data in payloads:
        result = create_topic(args.site, args.api_key, args.api_user, data)
        print(f"created topic {result.get('topic_id')}: {data['title']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
