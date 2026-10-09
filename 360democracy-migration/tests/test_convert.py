"""Tests for the Circle to Discourse conversion kit (python3 -m unittest discover tests)."""

import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import convert_circle_export as convert  # noqa: E402
import create_events  # noqa: E402
from html_to_markdown import body_to_markdown, html_to_markdown  # noqa: E402

SAMPLES = ROOT / "samples" / "circle_export"


def read(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


class ConvertSampleExport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name)
        cls.report = convert.convert(SAMPLES, cls.out)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_counts(self):
        counts = self.report["counts"]
        self.assertEqual(counts["users"], 5)  # 6 rows, one duplicate email
        self.assertEqual(counts["space_groups"], 2)
        self.assertEqual(counts["categories"], 5)  # 2 groups + 3 spaces
        self.assertEqual(counts["topics"], 4)
        self.assertEqual(counts["replies"], 4)  # orphan comment dropped

    def test_users_have_valid_unique_usernames(self):
        users = read(self.out / "users.csv")
        names = [u["username"] for u in users]
        self.assertEqual(len(names), len({n.lower() for n in names}))
        for name in names:
            self.assertRegex(name, r"^[A-Za-z0-9][A-Za-z0-9._-]{1,18}[A-Za-z0-9]$")
        by_id = {u["id"]: u for u in users}
        self.assertEqual(by_id["member-102"]["username"], "Rieke_Wonig")
        self.assertEqual(by_id["member-103"]["username"], "Ana_Maria_Lopez-Ruiz")
        self.assertEqual(by_id["member-104"]["username"], "Li_user")
        self.assertEqual(by_id["member-106"]["username"], "j.o")  # no name: email local part
        self.assertEqual(by_id["member-101"]["created_at"], "2024-03-01T10:00:00Z")
        self.assertEqual(by_id["member-101"]["tags"], "admin, demsoc")

    def test_duplicate_email_maps_to_first_member(self):
        self.assertEqual(self.report["unmatched"]["duplicate_member_emails"], ["rieke@example.org"])
        replies = {r["id"]: r for r in read(self.out / "replies.csv")}
        self.assertEqual(replies["comment-5002"]["user_id"], "member-102")

    def test_categories_follow_space_groups(self):
        categories = {c["id"]: c for c in read(self.out / "categories.csv")}
        self.assertEqual(categories["space-2"]["parent_id"], "group-nets4dem")
        self.assertEqual(categories["group-nets4dem"]["parent_id"], "")
        self.assertEqual(categories["space-3"]["read_restricted"], "false")
        self.assertEqual(categories["space-1"]["read_restricted"], "true")

    def test_topics_bodies_and_titles(self):
        topics = {t["id"]: t for t in read(self.out / "topics.csv")}
        html_topic = topics["post-1001"]
        self.assertEqual(html_topic["category_id"], "space-2")
        self.assertEqual(html_topic["user_id"], "member-102")
        self.assertIn("- Review the **Clause Bank**", html_topic["raw"])
        self.assertIn("[here](https://example.org/slides)", html_topic["raw"])
        tiptap_topic = topics["post-1002"]
        self.assertEqual(tiptap_topic["title"], "Schedule update")  # derived from the heading
        self.assertIn("**10 November**", tiptap_topic["raw"])
        self.assertIn("- 17:00 CET", tiptap_topic["raw"])
        self.assertEqual(topics["post-1003"]["raw"], "Plain text post.\nSecond line.")
        self.assertEqual(topics["post-1004"]["category_id"], "")
        self.assertEqual(self.report["unmatched"]["posts_without_space"], ["1004"])
        self.assertEqual(self.report["unmatched"]["posts_without_author"], ["1004"])
        self.assertEqual(self.report["body_formats"], {"html": 5, "tiptap": 1, "text": 2})

    def test_replies_keep_threading_and_report_orphans(self):
        replies = {r["id"]: r for r in read(self.out / "replies.csv")}
        self.assertEqual(replies["comment-5002"]["parent_import_id"], "comment-5001")
        self.assertEqual(replies["comment-5001"]["topic_import_id"], "post-1001")
        self.assertEqual(replies["comment-5005"]["user_id"], "")
        self.assertEqual(self.report["unmatched"]["comments_without_post"], ["5004"])
        self.assertEqual(self.report["unmatched"]["comments_without_author"], ["5005"])
        self.assertEqual(replies["comment-5001"]["raw"], "Great session!")

    def test_emails_file_is_csv_importer_compatible(self):
        emails = read(self.out / "emails.csv")
        self.assertEqual(list(emails[0].keys()), ["user_id", "email"])
        self.assertEqual(len(emails), 5)

    def test_report_written(self):
        report = json.loads((self.out / "report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["columns"]["members"]["email"], "Email")
        self.assertEqual(report["columns"]["comments"]["user_email"], "User Email")


class ColumnResolution(unittest.TestCase):
    def test_override_wins_and_missing_required_fails(self):
        cols = convert.resolve_columns("members", ["Member ID", "Mail"], {"members.email": "Mail"})
        self.assertEqual(cols["email"], "Mail")
        self.assertEqual(cols["id"], "Member ID")
        with self.assertRaises(SystemExit):
            convert.resolve_columns("members", ["Member ID", "Mail"], {})

    def test_cli_map_and_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run(
                [sys.executable, str(ROOT / "convert_circle_export.py"), str(SAMPLES), tmp, "--map", "members.email=Email"],
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertIn("users 5", result.stdout)
            self.assertTrue((Path(tmp) / "topics.csv").exists())


class Helpers(unittest.TestCase):
    def test_parse_date_formats(self):
        self.assertEqual(convert.parse_date("2026-07-10T10:15:00Z"), "2026-07-10T10:15:00Z")
        self.assertEqual(convert.parse_date("2026-07-10 12:15:00 +0200"), "2026-07-10T10:15:00Z")
        self.assertEqual(convert.parse_date("10/07/2026"), "2026-07-10T00:00:00Z")
        self.assertEqual(convert.parse_date("not a date"), "")
        self.assertEqual(convert.parse_date(""), "")

    def test_username_factory(self):
        factory = convert.UsernameFactory()
        self.assertEqual(factory.make("Domenico Di Siena", "d@x.org"), "Domenico_Di_Siena")
        self.assertEqual(factory.make("domenico di siena", "e@x.org"), "domenico_di_siena2")  # case-insensitive clash
        self.assertEqual(factory.make("", "ab@x.org"), "ab_user")
        self.assertEqual(len(factory.make("A very long name that exceeds twenty chars", "l@x.org")), 20)

    def test_derive_title(self):
        self.assertEqual(convert.derive_title("## Schedule **update**\n\nbody", "x"), "Schedule update")
        self.assertEqual(convert.derive_title("", "Post 7"), "Post 7")
        self.assertTrue(convert.derive_title("word " * 40, "x").endswith("..."))

    def test_html_to_markdown_blocks(self):
        md = html_to_markdown("<h2>Title</h2><blockquote><p>quoted</p></blockquote><pre>a &lt; b</pre><p>x<br>y</p>")
        self.assertIn("## Title", md)
        self.assertIn("> quoted", md)
        self.assertIn("```\na < b\n```", md)
        self.assertIn("x\ny", md)

    def test_body_to_markdown_detects_format(self):
        self.assertEqual(body_to_markdown(None), ("", "empty"))
        self.assertEqual(body_to_markdown("plain\r\ntext"), ("plain\ntext", "text"))
        self.assertEqual(body_to_markdown("<p>hi</p>")[1], "html")
        self.assertEqual(body_to_markdown('{"type":"doc","content":[]}'), ("", "tiptap"))
        self.assertEqual(body_to_markdown("{not json"), ("{not json", "text"))


class Events(unittest.TestCase):
    def test_event_raw(self):
        row = {
            "title": "Reflection Circle 3",
            "start": "2026-11-10 17:00",
            "end": "2026-11-10 18:00",
            "timezone": "Europe/Brussels",
            "category_id": "5",
            "description": "Harvest and learnings.",
            "url": "https://zoom.us/j/1",
            "allowed_groups": "nets4dem",
            "status": "private",
        }
        raw = create_events.event_raw(row)
        self.assertTrue(raw.startswith('[event start="2026-11-10 17:00" end="2026-11-10 18:00" timezone="Europe/Brussels"'))
        self.assertIn('url="https://zoom.us/j/1"', raw)
        self.assertIn('allowedGroups="nets4dem"', raw)
        self.assertTrue(raw.endswith("[/event]\n\nHarvest and learnings."))
        self.assertEqual(create_events.payload(row)["category"], 5)
        with self.assertRaises(ValueError):
            create_events.payload({"title": "x", "start": "", "category_id": "1"})

    def test_dry_run_on_sample(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "create_events.py"), str(ROOT / "discourse" / "events.sample.csv"), "--dry-run"],
            capture_output=True,
            text=True,
            check=True,
        )
        payloads = json.loads(result.stdout)
        self.assertEqual(len(payloads), 4)
        self.assertEqual(payloads[2]["title"], "Stakeholder Assembly | Morning Cohort | 1st Session")


if __name__ == "__main__":
    unittest.main()
