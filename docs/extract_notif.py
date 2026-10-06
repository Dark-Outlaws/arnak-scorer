import re

src = open(r"G:\arnak-scorer\docs\arnak.js", encoding="utf-8", errors="replace").read()

targets = [
    "notif_overcomeGuardian",
    "notif_idolGain",
    "notif_useIdol",
    "notif_gainIdol",
    "updatePlayerGuards",
    "updateScore",
]

for t in targets:
    m = re.search(re.escape(t), src)
    if not m:
        print(f"##### {t}: 未找到")
        continue
    start = m.start()
    # 函数体 = 从方法名后第一个 { 到匹配的 }
    brace = src.find("{", start)
    depth = 0
    i = brace
    while i < len(src):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                break
        i += 1
    body = src[brace:i + 1]
    print(f"\n##### {t} @ {start}")
    print(body[:1800])
