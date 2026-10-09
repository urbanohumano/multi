"""Convert Circle post bodies (HTML, TipTap JSON or plain text) to Markdown.

Standard library only, so the converter runs on any machine that has Python 3.10+.
Discourse accepts a safe subset of HTML in post bodies, but Markdown is what members
will see when they edit an imported post, so the import stores Markdown.
"""

from __future__ import annotations

import json
import re
from html.parser import HTMLParser

_HEADING = re.compile(r"^h([1-6])$")
_TAG = re.compile(r"<[a-zA-Z/][^>]*>")


class _MarkdownBuilder(HTMLParser):
    """Small HTML to Markdown converter covering what a community post uses."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.lists: list[list] = []  # [kind, counter]
        self.href: str | None = None
        self.in_pre = False
        self.in_code = False
        self.quote_starts: list[int] = []

    # -- helpers -----------------------------------------------------------
    def _break(self) -> None:
        self.out.append("\n\n")

    # -- tags --------------------------------------------------------------
    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: C901 (flat on purpose)
        a = dict(attrs)
        heading = _HEADING.match(tag)
        if tag in ("p", "div", "section", "article"):
            self._break()
        elif tag == "br":
            self.out.append("\n")
        elif tag in ("strong", "b"):
            self.out.append("**")
        elif tag in ("em", "i"):
            self.out.append("*")
        elif tag in ("s", "del", "strike"):
            self.out.append("~~")
        elif tag == "a":
            self.href = a.get("href")
            self.out.append("[")
        elif tag == "img":
            self._break()
            self.out.append(f"![{a.get('alt', '')}]({a.get('src', '')})")
            self._break()
        elif tag in ("ul", "ol"):
            self._break()
            self.lists.append([tag, 0])
        elif tag == "li" and self.lists:
            kind, _ = self.lists[-1]
            self.lists[-1][1] += 1
            indent = "  " * (len(self.lists) - 1)
            marker = f"{self.lists[-1][1]}." if kind == "ol" else "-"
            self.out.append(f"\n{indent}{marker} ")
        elif heading:
            self._break()
            self.out.append("#" * int(heading.group(1)) + " ")
        elif tag == "blockquote":
            self._break()
            self.quote_starts.append(len(self.out))
        elif tag == "pre":
            self._break()
            self.in_pre = True
            self.out.append("```\n")
        elif tag == "code" and not self.in_pre:
            self.in_code = True
            self.out.append("`")
        elif tag == "hr":
            self._break()
            self.out.append("---")
            self._break()

    def handle_endtag(self, tag: str) -> None:
        if tag in ("p", "div", "section", "article"):
            self._break()
        elif tag in ("strong", "b"):
            self.out.append("**")
        elif tag in ("em", "i"):
            self.out.append("*")
        elif tag in ("s", "del", "strike"):
            self.out.append("~~")
        elif tag == "a":
            self.out.append(f"]({self.href or ''})")
            self.href = None
        elif tag in ("ul", "ol"):
            if self.lists:
                self.lists.pop()
            self._break()
        elif _HEADING.match(tag):
            self._break()
        elif tag == "blockquote" and self.quote_starts:
            start = self.quote_starts.pop()
            quoted = "".join(self.out[start:]).strip()
            del self.out[start:]
            lines = [("> " + line) if line.strip() else ">" for line in quoted.splitlines()]
            self.out.append("\n".join(lines))
            self._break()
        elif tag == "pre":
            self.out.append("\n```")
            self.in_pre = False
            self._break()
        elif tag == "code" and self.in_code:
            self.out.append("`")
            self.in_code = False

    def handle_data(self, data: str) -> None:
        if self.in_pre:
            self.out.append(data)
        else:
            self.out.append(re.sub(r"\s+", " ", data))

    def result(self) -> str:
        text = "".join(self.out)
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()


def html_to_markdown(html: str) -> str:
    """Convert an HTML fragment to Markdown."""
    if not html:
        return ""
    builder = _MarkdownBuilder()
    builder.feed(html)
    builder.close()
    return builder.result()


# -- TipTap / ProseMirror JSON ---------------------------------------------


def _marks(text: str, marks: list[dict] | None) -> str:
    for mark in marks or []:
        kind = mark.get("type")
        if kind == "bold":
            text = f"**{text}**"
        elif kind == "italic":
            text = f"*{text}*"
        elif kind == "strike":
            text = f"~~{text}~~"
        elif kind == "code":
            text = f"`{text}`"
        elif kind == "link":
            text = f"[{text}]({mark.get('attrs', {}).get('href', '')})"
    return text


def _inline(node: dict) -> str:
    kind = node.get("type")
    if kind == "text":
        return _marks(node.get("text", ""), node.get("marks"))
    if kind == "hardBreak":
        return "\n"
    if kind == "mention":
        attrs = node.get("attrs", {})
        return "@" + str(attrs.get("label") or attrs.get("id") or "")
    if kind == "image":
        attrs = node.get("attrs", {})
        return f"![{attrs.get('alt', '')}]({attrs.get('src', '')})"
    return "".join(_inline(child) for child in node.get("content", []))


def _block(node: dict, depth: int = 0) -> str:
    kind = node.get("type")
    children = node.get("content", [])
    if kind == "paragraph":
        return "".join(_inline(c) for c in children)
    if kind == "heading":
        level = int(node.get("attrs", {}).get("level", 2))
        return "#" * level + " " + "".join(_inline(c) for c in children)
    if kind in ("bulletList", "orderedList"):
        lines = []
        for index, item in enumerate(children, start=1):
            marker = f"{index}." if kind == "orderedList" else "-"
            body = "\n".join(_block(c, depth + 1) for c in item.get("content", []))
            first, _, rest = body.partition("\n")
            lines.append("  " * depth + f"{marker} {first}")
            if rest:
                lines.append(rest)
        return "\n".join(lines)
    if kind == "blockquote":
        inner = "\n\n".join(_block(c, depth) for c in children)
        return "\n".join("> " + line for line in inner.splitlines())
    if kind == "codeBlock":
        return "```\n" + "".join(_inline(c) for c in children) + "\n```"
    if kind == "image":
        return _inline(node)
    if kind == "horizontalRule":
        return "---"
    return "\n\n".join(_block(c, depth) for c in children) if children else _inline(node)


def tiptap_to_markdown(doc: dict) -> str:
    """Convert a TipTap/ProseMirror document (type: doc) to Markdown."""
    blocks = [_block(node) for node in doc.get("content", [])]
    return re.sub(r"\n{3,}", "\n\n", "\n\n".join(b for b in blocks if b.strip())).strip()


# -- entry point -------------------------------------------------------------


def body_to_markdown(body: str | None) -> tuple[str, str]:
    """Return (markdown, detected_format) for a Circle body of unknown format."""
    if body is None:
        return "", "empty"
    text = body.strip()
    if not text:
        return "", "empty"
    if text.startswith("{"):
        try:
            doc = json.loads(text)
        except json.JSONDecodeError:
            doc = None
        if isinstance(doc, dict) and doc.get("type") == "doc":
            return tiptap_to_markdown(doc), "tiptap"
    if _TAG.search(text):
        return html_to_markdown(text), "html"
    return text.replace("\r\n", "\n"), "text"
