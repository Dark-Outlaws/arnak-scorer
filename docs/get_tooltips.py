import urllib.request

url = "https://x.boardgamearena.net/data/themereleases/current/games/arnak/260708-1244/modules/tooltips.js"
dest = r"G:\arnak-scorer\docs\tooltips.js"

req = urllib.request.Request(url, headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
})
with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
    data = r.read()
    f.write(data)
    print("downloaded", len(data), "bytes")

src = open(dest, encoding="utf-8", errors="replace").read()
print("len chars:", len(src))

import re
for pat_name, pat in [
    ("score/vp", re.compile(r"vp|score|point", re.I)),
    ("researchBonus", re.compile(r"researchBonus|research", re.I)),
    ("card", re.compile(r"card|item|art", re.I)),
]:
    print(f"\n########## {pat_name} ##########")
    count = 0
    for m in pat.finditer(src):
        s = max(0, m.start() - 120)
        e = min(len(src), m.end() + 120)
        print(f"[{m.start()}]: ...{src[s:e]}...")
        count += 1
        if count >= 15:
            print("... (截断)")
            break
