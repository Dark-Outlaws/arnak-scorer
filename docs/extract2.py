import re

src = open(r"G:\arnak-scorer\docs\arnak.js", encoding="utf-8", errors="replace").read()

def extract(name):
    m = re.search(re.escape(name) + r":function", src)
    if not m:
        print(f"##### {name}: 未找到")
        return
    brace = src.find("{", m.start())
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
    print(f"\n##### {name}")
    print(src[brace:i + 1][:1500])

for n in ["notif_idolGain", "notif_overcomeGuardian", "updatePlayerGuards", "clickIdolBonus", "notif_gainFear", "notif_exileCard", "notif_getTempleTile"]:
    extract(n)

# 搜 idol_slot 和 guardian 的所有赋值/使用点
print("\n\n===== idol_slot 出现点 =====")
for m in re.finditer(r"idol_slot", src):
    s = max(0, m.start() - 90)
    print(f"[{m.start()}]: ...{src[s:m.end() + 90]}...")

print("\n\n===== guardian 赋值/更新点 =====")
for m in re.finditer(r"guardian[^a-zA-Z_]", src):
    s = max(0, m.start() - 90)
    e = min(len(src), m.end() + 90)
    line = src[s:e]
    if "=" in line or "guardian" in line:
        print(f"[{m.start()}]: ...{line}...")
