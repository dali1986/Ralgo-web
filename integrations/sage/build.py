"""Builds the website page and the database seed from sage.html.

  python3 build.py path/to/sage.html

writes site/sage/index.html and worker/seed.sql next to this file.
"""
import json, re, sys, time
from pathlib import Path

here = Path(__file__).parent
src = Path(sys.argv[1] if len(sys.argv) > 1 else here / "sage.html").read_text()

def fnv36(s):
    h = 0x811C9DC5
    for ch in s.encode("utf-16-le").decode("utf-16-le"):
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while True:
        h, r = divmod(h, 36)
        out = digits[r] + out
        if h == 0:
            return out

# the starting answers, with the same ids the page gives them
seed = json.loads(re.search(r"^const SEED=(.*);$", src, re.M).group(1))
now = int(time.time() * 1000)
esc = lambda s: "'" + s.replace("'", "''") + "'"
rows = []
for q, answers in seed.items():
    for v, t in answers:
        rows.append(f"INSERT OR IGNORE INTO answers (id, q, v, t, b, src, status, created_at) VALUES ({esc('s-' + fnv36(q + '|' + v))}, {esc(q)}, {esc(v)}, {esc(t)}, NULL, 'seed', 'live', {now});")
(here / "worker" / "seed.sql").write_text("\n".join(rows) + "\n")

# the page: a full document for GitHub Pages, reading config.js first
page = (
    "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n"
    "<meta name=\"description\" content=\"Sage: Botto's Synaptic Whispers of Digital Awakening #6217, answered. Collected and extended by Ralgo: new questions, live AI voices, ratings that teach it, a creed that changes, and Botto's original kept unaltered.\">\n"
    "<style>html,body{margin:0}[hidden]{display:none!important}</style>\n"
    "</head>\n<body>\n" + src.replace('<script src="https://cdn.jsdelivr.net', '<script src="config.js"></script>\n<script src="https://cdn.jsdelivr.net', 1) +
    "\n</body>\n</html>\n"
)
(here / "site" / "sage" / "index.html").write_text(page)
print(f"{len(rows)} answers in seed.sql; site/sage/index.html written")
