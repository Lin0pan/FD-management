#!/usr/bin/env python3
"""Scaffold, extend and check arc42 documentation.

Three subcommands, all operating on a docs directory (default: docs/architecture):

    init            copy the twelve chapter skeletons + README, never overwriting
    new-adr TITLE   create the next ADR from the template and index it in chapter 9
    check           report structural drift: missing chapters, unindexed ADRs, dead links

Standard library only, so it runs wherever Python 3.8+ does.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
SKELETON = SKILL_DIR / "assets" / "skeleton"
DEFAULT_DOCS = Path("docs/architecture")

CHAPTERS = [
    "01-introduction-and-goals.md",
    "02-architecture-constraints.md",
    "03-context-and-scope.md",
    "04-solution-strategy.md",
    "05-building-block-view.md",
    "06-runtime-view.md",
    "07-deployment-view.md",
    "08-crosscutting-concepts.md",
    "09-architectural-decisions.md",
    "10-quality-requirements.md",
    "11-risks-and-technical-debt.md",
    "12-glossary.md",
]
DECISIONS = "09-architectural-decisions.md"

ADR_FILE_RE = re.compile(r"^(\d{3})-(.+)\.md$")
ADR_TITLE_RE = re.compile(r"^#\s+ADR-(\d+)\s+[—-]\s+(.+?)\s*$", re.MULTILINE)
STATUS_RE = re.compile(r"^-\s+\*\*Status:\*\*\s*(.+?)\s*$", re.MULTILINE)
DATE_RE = re.compile(r"^-\s+\*\*Date:\*\*\s*(.+?)\s*$", re.MULTILINE)
REVIEWED_RE = re.compile(r"^_Last reviewed:\s*(.+?)_\s*$", re.MULTILINE)
LINK_RE = re.compile(r"(?<!\!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
TODO_RE = re.compile(r">\s*\*\*TODO:?\*\*")
VALID_STATUS_RE = re.compile(r"^(Pending|Accepted|Superseded by ADR-\d+)$")

ERRORS: list[str] = []
WARNINGS: list[str] = []


def error(msg: str) -> None:
    ERRORS.append(msg)


def warn(msg: str) -> None:
    WARNINGS.append(msg)


def today() -> str:
    return dt.date.today().isoformat()


def project_name(docs: Path) -> str:
    """Best guess at the project's name, for the README heading."""
    try:
        root = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        if root:
            return Path(root).name
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return docs.resolve().parent.name


def slugify(title: str) -> str:
    ascii_title = (
        unicodedata.normalize("NFKD", title)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_title).strip("-")
    return slug or "decision"


def render(text: str, **values: str) -> str:
    for key, value in values.items():
        text = text.replace("{{%s}}" % key, value)
    return text


# ---------------------------------------------------------------- init


def cmd_init(docs: Path) -> int:
    if not SKELETON.is_dir():
        print(f"skeleton not found at {SKELETON}", file=sys.stderr)
        return 2

    values = {"DATE": today(), "PROJECT": project_name(docs)}
    created, skipped = [], []

    for source in sorted(SKELETON.rglob("*.md")):
        target = docs / source.relative_to(SKELETON)
        if target.exists():
            skipped.append(target)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(render(source.read_text(encoding="utf-8"), **values), encoding="utf-8")
        created.append(target)

    for path in created:
        print(f"created  {path}")
    for path in skipped:
        print(f"kept     {path} (already exists)")

    if created:
        print(
            "\nFill chapter 1 first, then 2, 3, 5, 6 and 10. Leave a `> **TODO:**` where you do not "
            "know — a marked gap is worth more than a plausible guess."
        )
    return 0


# ------------------------------------------------------------- new-adr


def adr_files(adr_dir: Path) -> list[tuple[int, Path]]:
    found = []
    if adr_dir.is_dir():
        for path in sorted(adr_dir.glob("*.md")):
            match = ADR_FILE_RE.match(path.name)
            if match:
                found.append((int(match.group(1)), path))
    return found


def index_adr(decisions: Path, number: int, title: str, rel_link: str, date: str) -> bool:
    """Append a row to the decision table in chapter 9. Returns True if it was written."""
    if not decisions.exists():
        warn(f"{decisions} not found — add the index row by hand")
        return False

    lines = decisions.read_text(encoding="utf-8").splitlines()
    header = next(
        (i for i, line in enumerate(lines)
         if line.startswith("|") and re.match(r"^\|\s*ADR\s*\|", line)),
        None,
    )
    if header is None:
        warn(f"no decision table found in {decisions} — add the index row by hand")
        return False

    end = header + 2  # header + separator
    while end < len(lines) and lines[end].lstrip().startswith("|"):
        end += 1

    row = f"| [{number:03d}]({rel_link}) | {title} | Pending | {date} |"
    lines.insert(end, row)
    decisions.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return True


def cmd_new_adr(docs: Path, title: str) -> int:
    adr_dir = docs / "adr"
    adr_dir.mkdir(parents=True, exist_ok=True)

    template = adr_dir / "template.md"
    if not template.exists():
        template = SKELETON / "adr" / "template.md"
    if not template.exists():
        print(f"ADR template not found at {template}", file=sys.stderr)
        return 2

    number = max((n for n, _ in adr_files(adr_dir)), default=0) + 1
    path = adr_dir / f"{number:03d}-{slugify(title)}.md"
    if path.exists():
        print(f"{path} already exists", file=sys.stderr)
        return 2

    date = today()
    path.write_text(
        render(
            template.read_text(encoding="utf-8"),
            NUMBER=f"{number:03d}", TITLE=title, DATE=date,
        ),
        encoding="utf-8",
    )
    print(f"created  {path}")

    if index_adr(docs / DECISIONS, number, title, f"adr/{path.name}", date):
        print(f"indexed  {docs / DECISIONS}")
    for message in WARNINGS:
        print(f"note: {message}")

    print(
        "\nFill Context, Considered options, Decision and Consequences, then set the status to "
        "Accepted in both the ADR and the index row."
    )
    return 0


# --------------------------------------------------------------- check


def check_chapters(docs: Path) -> None:
    for index, name in enumerate(CHAPTERS, start=1):
        path = docs / name
        if not path.exists():
            error(f"missing chapter file: {path}")
            continue
        text = path.read_text(encoding="utf-8")
        if not re.match(rf"^#\s+{index}\.\s+\S", text):
            warn(f"{path}: first line should be '# {index}. <Title>'")
        reviewed = REVIEWED_RE.search(text)
        if not reviewed:
            warn(f"{path}: no '_Last reviewed: YYYY-MM-DD_' line")
        elif not re.match(r"^\d{4}-\d{2}-\d{2}$", reviewed.group(1)):
            warn(f"{path}: review date '{reviewed.group(1)}' is not YYYY-MM-DD")

    for stray in sorted(docs.glob("[0-9][0-9]-*.md")):
        if stray.name not in CHAPTERS:
            warn(f"{stray}: not one of the twelve arc42 chapter filenames")


def check_adrs(docs: Path) -> None:
    adr_dir = docs / "adr"
    files = adr_files(adr_dir)
    if not files:
        return

    seen: dict[int, Path] = {}
    statuses: dict[int, str] = {}
    for number, path in files:
        if number in seen:
            error(f"duplicate ADR number {number:03d}: {seen[number].name} and {path.name}")
        seen[number] = path

        text = path.read_text(encoding="utf-8")
        title = ADR_TITLE_RE.search(text)
        if not title:
            error(f"{path}: no '# ADR-NNN — Title' heading")
        elif int(title.group(1)) != number:
            error(f"{path}: heading says ADR-{title.group(1)}, filename says {number:03d}")

        status = STATUS_RE.search(text)
        if not status:
            error(f"{path}: no '- **Status:**' line")
        else:
            statuses[number] = status.group(1)
            if not VALID_STATUS_RE.match(status.group(1)):
                warn(
                    f"{path}: status '{status.group(1)}' is not Pending, Accepted "
                    f"or 'Superseded by ADR-NNN'"
                )
            superseded = re.match(r"^Superseded by ADR-(\d+)$", status.group(1))
            if superseded:
                successor = int(superseded.group(1))
                if not any(adr_dir.glob(f"{successor:03d}-*.md")):
                    error(f"{path}: superseded by ADR-{successor:03d}, which does not exist")

        if not DATE_RE.search(text):
            warn(f"{path}: no '- **Date:**' line")

    check_adr_index(docs, seen, statuses)


def check_adr_index(docs: Path, files: dict[int, Path], statuses: dict[int, str]) -> None:
    decisions = docs / DECISIONS
    if not decisions.exists():
        return

    text = decisions.read_text(encoding="utf-8")
    indexed: dict[int, str] = {}
    for line in text.splitlines():
        if not line.lstrip().startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) < 3:
            continue
        match = re.search(r"\[(\d+)\]", cells[0]) or re.match(r"^(\d+)$", cells[0])
        if match:
            indexed[int(match.group(1))] = cells[2]

    for number, path in sorted(files.items()):
        if number not in indexed:
            error(f"{path.name} is not in the decision log in {DECISIONS}")
        elif number in statuses and indexed[number] != statuses[number]:
            error(
                f"ADR-{number:03d}: status is '{statuses[number]}' in the file but "
                f"'{indexed[number]}' in {DECISIONS}"
            )
    for number in sorted(indexed):
        if number not in files:
            warn(f"{DECISIONS} lists ADR-{number:03d}, but no such file exists in adr/")


def check_links(docs: Path) -> None:
    for path in sorted(docs.rglob("*.md")):
        for target in LINK_RE.findall(path.read_text(encoding="utf-8")):
            if re.match(r"^(https?:|mailto:|#|/)", target):
                continue
            resolved = (path.parent / target.split("#")[0]).resolve()
            if not resolved.exists():
                error(f"{path}: dead link -> {target}")


def check_todos(docs: Path) -> None:
    total = 0
    for path in sorted(docs.rglob("*.md")):
        if path.name == "template.md":
            continue
        count = len(TODO_RE.findall(path.read_text(encoding="utf-8")))
        if count:
            print(f"  {count:>3}  {path}")
            total += count
    if total:
        print(f"  {total:>3}  open TODO markers in total\n")


def cmd_check(docs: Path) -> int:
    if not docs.is_dir():
        print(f"no documentation at {docs} — run `init` first", file=sys.stderr)
        return 2

    check_chapters(docs)
    check_adrs(docs)
    check_links(docs)

    print(f"arc42 check: {docs}\n")
    check_todos(docs)

    for message in ERRORS:
        print(f"ERROR    {message}")
    for message in WARNINGS:
        print(f"warning  {message}")

    if ERRORS:
        print(f"\n{len(ERRORS)} error(s), {len(WARNINGS)} warning(s).")
        return 1
    print(f"\nNo errors, {len(WARNINGS)} warning(s). Structure is sound — whether it is still "
          f"true is a question for the reviewers.")
    return 0


# ---------------------------------------------------------------- main


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dir", type=Path, default=DEFAULT_DOCS,
        help=f"documentation directory (default: {DEFAULT_DOCS})",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init", help="create the chapter skeletons")
    adr = sub.add_parser("new-adr", help="create and index the next ADR")
    adr.add_argument("title", help="the decision itself, e.g. 'Use SQLite as the datastore'")
    sub.add_parser("check", help="report structural drift")

    args = parser.parse_args()
    if args.command == "init":
        return cmd_init(args.dir)
    if args.command == "new-adr":
        return cmd_new_adr(args.dir, args.title)
    return cmd_check(args.dir)


if __name__ == "__main__":
    sys.exit(main())
