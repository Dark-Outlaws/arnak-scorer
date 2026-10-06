import re

src = open(r"G:\arnak-scorer\docs\arnak.js", encoding="utf-8", errors="replace").read()

pats = {
    "research": re.compile(r"research", re.I),
    "vp/point/score": re.compile(r"\bvp\b|victory|points|score", re.I),
    "temple": re.compile(r"temple|birdTemple|snake", re.I),
    "cards config": re.compile(r"cards\s*[:=]|cardData|cardsData", re.I),
    "idol": re.compile(r"idol", re.I),
}

for name, pat in pats.items():
    print(f"\n########## {name} ##########")
    count = 0
    for m in pat.finditer(src):
        start = max(0, m.start() - 150)
        end = min(len(src), m.end() + 150)
        print(f"[{m.start()}]: ...{src[start:end]}...")
        count += 1
        if count >= 12:
            print(f"... (截断)")
            break
