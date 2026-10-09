#!/usr/bin/env python3
"""Convert Circle's official data export into CSV files for the Discourse importer.

Circle sends four CSV files on request (Members, Spaces, Posts, Comments). Their exact
column names are not documented, so every field is resolved from a list of likely
headers and can be overridden with --map. The output goes to one directory:

    users.csv       id, username, name, email, created_at, tags
    emails.csv      user_id, email                 (csv_importer compatible)
    categories.csv  id, parent_id, name, description, read_restricted
    topics.csv      id, user_id, category_id, title, raw, created_at
    replies.csv     id, topic_import_id, parent_import_id, user_id, raw, created_at
    report.json     counts and everything that could not be matched

Import ids are prefixed (member-, space-, group-, post-, comment-) so they never
collide inside Discourse. Run discourse/circle.rb on the output directory.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from html_to_markdown import body_to_markdown  # noqa: E402

CANDIDATES: dict[str, dict[str, list[str]]] = {
    "members": {
        "id": ["id", "member_id", "user_id", "community_member_id"],
        "email": ["email", "email_address", "user_email"],
        "name": ["name", "full_name", "display_name", "member_name"],
        "first_name": ["first_name", "firstname"],
        "last_name": ["last_name", "lastname"],
        "created_at": ["joined_at", "created_at", "date_joined", "joined", "member_since", "invitation_accepted_at"],
        "tags": ["tags", "member_tags"],
    },
    "spaces": {
        "id": ["id", "space_id"],
        "name": ["name", "space_name", "title"],
        "description": ["description", "about"],
        "space_group": ["space_group", "space_group_name", "space_group_id", "group"],
        "visibility": ["visibility", "is_private", "private", "privacy"],
    },
    "posts": {
        "id": ["id", "post_id"],
        "space_id": ["space_id"],
        "space_name": ["space_name", "space"],
        "user_id": ["user_id", "member_id", "author_id", "community_member_id"],
        "user_email": ["user_email", "author_email", "email"],
        "title": ["title", "name", "post_title"],
        "body": ["body", "content", "body_html", "body_text", "text", "tiptap_body"],
        "created_at": ["created_at", "published_at", "posted_at"],
    },
    "comments": {
        "id": ["id", "comment_id"],
        "post_id": ["post_id"],
        "parent_id": ["parent_comment_id", "parent_id", "reply_to_id"],
        "user_id": ["user_id", "member_id", "author_id", "community_member_id"],
        "user_email": ["user_email", "author_email", "email"],
        "body": ["body", "content", "body_html", "body_text", "text", "tiptap_body"],
        "created_at": ["created_at", "published_at", "posted_at"],
    },
}

REQUIRED: dict[str, list[str]] = {
    "members": ["id", "email"],
    "spaces": ["id", "name"],
    "posts": ["id", "body"],
    "comments": ["id", "post_id", "body"],
}

DATE_FORMATS = (
    "%Y-%m-%dT%H:%M:%S.%f%z",
    "%Y-%m-%dT%H:%M:%S%z",
    "%Y-%m-%d %H:%M:%S %z",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%fZ",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%d",
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y",
    "%m/%d/%Y %H:%M",
    "%m/%d/%Y",
)


def normalize_header(header: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", header.strip().lower()).strip("_")


def resolve_columns(kind: str, headers: list[str], overrides: dict[str, str]) -> dict[str, str | None]:
    """Map each logical field to the actual CSV header, or None when absent."""
    normalized = {normalize_header(h): h for h in headers}
    resolved: dict[str, str | None] = {}
    for field, candidates in CANDIDATES[kind].items():
        override = overrides.get(f"{kind}.{field}")
        if override:
            if override not in headers:
                raise SystemExit(f"--map {kind}.{field}={override!r}: column not found in {kind} file")
            resolved[field] = override
            continue
        resolved[field] = next((normalized[c] for c in candidates if c in normalized), None)
    missing = [f for f in REQUIRED[kind] if resolved.get(f) is None]
    if missing:
        raise SystemExit(
            f"{kind}: could not find columns for {missing}. Headers are {headers}. "
            f"Use --map {kind}.<field>=<header> to point at the right column."
        )
    return resolved


def parse_date(value: str | None) -> str:
    """Return an ISO 8601 UTC timestamp, or '' when the value cannot be parsed."""
    if not value or not value.strip():
        return ""
    raw = value.strip()
    for fmt in DATE_FORMATS:
        try:
            parsed = datetime.strptime(raw, fmt)
        except ValueError:
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return ""


def slugify(value: str, fallback: str = "x") -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")
    return slug or fallback


class UsernameFactory:
    """Discourse usernames: 3-20 chars of letters, digits, dot, dash, underscore, unique."""

    def __init__(self) -> None:
        self.taken: set[str] = set()

    def make(self, name: str, email: str) -> str:
        base = name.strip() or email.split("@", 1)[0]
        base = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode()
        base = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._-")
        base = re.sub(r"[._-]{2,}", "_", base)
        if len(base) < 3:
            base = (base + "_user")[:20].strip("._-") or "member"
        base = base[:20].rstrip("._-")
        candidate, n = base, 1
        while candidate.lower() in self.taken:
            n += 1
            suffix = str(n)
            candidate = base[: 20 - len(suffix)].rstrip("._-") + suffix
        self.taken.add(candidate.lower())
        return candidate


def derive_title(raw: str, fallback: str) -> str:
    first = next((line for line in raw.splitlines() if line.strip()), "")
    first = re.sub(r"[#>*_`\[\]!]+", " ", first)
    first = re.sub(r"\(https?://[^)]*\)", "", first)
    first = re.sub(r"\s+", " ", first).strip()
    if len(first) > 80:
        first = first[:77].rsplit(" ", 1)[0] + "..."
    return first or fallback


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        rows = [dict(row) for row in reader]
        return list(reader.fieldnames or []), rows


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def get(row: dict[str, str], columns: dict[str, str | None], field: str) -> str:
    column = columns.get(field)
    return (row.get(column) or "").strip() if column else ""


def convert(input_dir: Path, output_dir: Path, overrides: dict[str, str] | None = None) -> dict:
    overrides = overrides or {}
    files = {kind: input_dir / f"{kind}.csv" for kind in CANDIDATES}
    for kind, path in files.items():
        if not path.exists():
            raise SystemExit(f"missing {path} (expected members.csv, spaces.csv, posts.csv, comments.csv)")
    output_dir.mkdir(parents=True, exist_ok=True)
    report: dict = {"columns": {}, "counts": {}, "unmatched": {}, "body_formats": {}}

    # -- members ---------------------------------------------------------
    headers, rows = read_csv(files["members"])
    cols = resolve_columns("members", headers, overrides)
    report["columns"]["members"] = cols
    usernames = UsernameFactory()
    users: list[dict] = []
    by_member_id: dict[str, str] = {}
    by_email: dict[str, str] = {}
    duplicates: list[str] = []
    for row in rows:
        email = get(row, cols, "email").lower()
        member_id = get(row, cols, "id")
        if not email or not member_id:
            continue
        if email in by_email:
            duplicates.append(email)
            by_member_id[member_id] = by_email[email]
            continue
        name = get(row, cols, "name") or " ".join(
            part for part in (get(row, cols, "first_name"), get(row, cols, "last_name")) if part
        )
        import_id = f"member-{member_id}"
        users.append(
            {
                "id": import_id,
                "username": usernames.make(name, email),
                "name": name,
                "email": email,
                "created_at": parse_date(get(row, cols, "created_at")),
                "tags": get(row, cols, "tags"),
            }
        )
        by_member_id[member_id] = import_id
        by_email[email] = import_id
    report["counts"]["users"] = len(users)
    report["unmatched"]["duplicate_member_emails"] = duplicates

    def author_of(row: dict, cols: dict) -> str:
        member_id = get(row, cols, "user_id")
        email = get(row, cols, "user_email").lower()
        return by_member_id.get(member_id) or by_email.get(email) or ""

    # -- spaces -> categories -------------------------------------------
    headers, rows = read_csv(files["spaces"])
    cols = resolve_columns("spaces", headers, overrides)
    report["columns"]["spaces"] = cols
    categories: list[dict] = []
    groups: dict[str, str] = {}
    space_by_id: dict[str, str] = {}
    space_by_name: dict[str, str] = {}
    for row in rows:
        space_id = get(row, cols, "id")
        name = get(row, cols, "name")
        if not space_id or not name:
            continue
        group_name = get(row, cols, "space_group")
        parent_id = ""
        if group_name:
            parent_id = groups.get(group_name)
            if parent_id is None:
                parent_id = f"group-{slugify(group_name)}"
                groups[group_name] = parent_id
                categories.append(
                    {"id": parent_id, "parent_id": "", "name": group_name, "description": "", "read_restricted": "true"}
                )
        visibility = get(row, cols, "visibility").lower()
        is_open = visibility in ("open", "public", "false", "no", "0")
        import_id = f"space-{space_id}"
        categories.append(
            {
                "id": import_id,
                "parent_id": parent_id,
                "name": name,
                "description": get(row, cols, "description"),
                "read_restricted": "false" if is_open else "true",
            }
        )
        space_by_id[space_id] = import_id
        space_by_name[name.lower()] = import_id
    report["counts"]["categories"] = len(categories)
    report["counts"]["space_groups"] = len(groups)

    # -- posts -> topics -------------------------------------------------
    headers, rows = read_csv(files["posts"])
    cols = resolve_columns("posts", headers, overrides)
    report["columns"]["posts"] = cols
    if cols.get("space_id") is None and cols.get("space_name") is None:
        raise SystemExit("posts: need a space_id or space_name column to place topics in categories")
    topics: list[dict] = []
    topic_ids: set[str] = set()
    formats: dict[str, int] = {}
    no_author: list[str] = []
    no_space: list[str] = []
    for row in rows:
        post_id = get(row, cols, "id")
        if not post_id:
            continue
        raw, fmt = body_to_markdown(get(row, cols, "body"))
        formats[fmt] = formats.get(fmt, 0) + 1
        category = space_by_id.get(get(row, cols, "space_id")) or space_by_name.get(get(row, cols, "space_name").lower(), "")
        if not category:
            no_space.append(post_id)
        author = author_of(row, cols)
        if not author:
            no_author.append(post_id)
        title = get(row, cols, "title") or derive_title(raw, f"Post {post_id}")
        import_id = f"post-{post_id}"
        topics.append(
            {
                "id": import_id,
                "user_id": author,
                "category_id": category,
                "title": title,
                "raw": raw or "(empty post)",
                "created_at": parse_date(get(row, cols, "created_at")),
            }
        )
        topic_ids.add(import_id)
    report["counts"]["topics"] = len(topics)
    report["unmatched"]["posts_without_author"] = no_author
    report["unmatched"]["posts_without_space"] = no_space

    # -- comments -> replies ---------------------------------------------
    headers, rows = read_csv(files["comments"])
    cols = resolve_columns("comments", headers, overrides)
    report["columns"]["comments"] = cols
    replies: list[dict] = []
    orphans: list[str] = []
    reply_no_author: list[str] = []
    for row in rows:
        comment_id = get(row, cols, "id")
        if not comment_id:
            continue
        topic_import_id = f"post-{get(row, cols, 'post_id')}"
        if topic_import_id not in topic_ids:
            orphans.append(comment_id)
            continue
        raw, fmt = body_to_markdown(get(row, cols, "body"))
        formats[fmt] = formats.get(fmt, 0) + 1
        author = author_of(row, cols)
        if not author:
            reply_no_author.append(comment_id)
        parent = get(row, cols, "parent_id")
        replies.append(
            {
                "id": f"comment-{comment_id}",
                "topic_import_id": topic_import_id,
                "parent_import_id": f"comment-{parent}" if parent else "",
                "user_id": author,
                "raw": raw or "(empty comment)",
                "created_at": parse_date(get(row, cols, "created_at")),
            }
        )
    replies.sort(key=lambda r: (r["created_at"], r["id"]))
    report["counts"]["replies"] = len(replies)
    report["unmatched"]["comments_without_post"] = orphans
    report["unmatched"]["comments_without_author"] = reply_no_author
    report["body_formats"] = formats

    # -- write -----------------------------------------------------------
    write_csv(output_dir / "users.csv", ["id", "username", "name", "email", "created_at", "tags"], users)
    write_csv(output_dir / "emails.csv", ["user_id", "email"], [{"user_id": u["id"], "email": u["email"]} for u in users])
    write_csv(output_dir / "categories.csv", ["id", "parent_id", "name", "description", "read_restricted"], categories)
    write_csv(output_dir / "topics.csv", ["id", "user_id", "category_id", "title", "raw", "created_at"], topics)
    write_csv(
        output_dir / "replies.csv",
        ["id", "topic_import_id", "parent_import_id", "user_id", "raw", "created_at"],
        replies,
    )
    (output_dir / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report


def parse_overrides(values: list[str]) -> dict[str, str]:
    overrides: dict[str, str] = {}
    for value in values:
        key, sep, header = value.partition("=")
        if not sep or key.count(".") != 1:
            raise SystemExit(f"--map expects kind.field=Header, got {value!r}")
        overrides[key.strip()] = header.strip()
    return overrides


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input_dir", type=Path, help="directory with members.csv, spaces.csv, posts.csv, comments.csv")
    parser.add_argument("output_dir", type=Path, help="directory that will receive the Discourse import files")
    parser.add_argument(
        "--map",
        action="append",
        default=[],
        metavar="kind.field=Header",
        help="force a column, e.g. --map members.email='Email Address' (repeatable)",
    )
    args = parser.parse_args(argv)
    report = convert(args.input_dir, args.output_dir, parse_overrides(args.map))
    counts = report["counts"]
    print(
        f"users {counts['users']}, categories {counts['categories']} "
        f"(space groups {counts['space_groups']}), topics {counts['topics']}, replies {counts['replies']}"
    )
    for key, value in report["unmatched"].items():
        if value:
            print(f"  {key}: {len(value)} (see report.json)")
    print(f"body formats: {report['body_formats']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
