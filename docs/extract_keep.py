import re

src = open(r"G:\arnak-scorer\docs\arnak.js", encoding="utf-8", errors="replace").read()

def extract(name):
    m = re.search(re.escape(name) + r":function", src)
    if not m:
        m = re.search(re.escape(name), src)
        if not m:
            print(f"##### {name}: 未找到")
            return
        print(f"##### {name} (无 :function，可能是字符串引用) @ {m.start()}")
        print("    ..." + src[max(0, m.start()-120):m.end()+180] + "...")
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
    print(src[brace:i + 1][:1200])

for n in ["notif_discardedItems", "notif_putToDeck", "notif_showAllCards", "notif_earringKeep", "decideKeep", "confirmKeep", "notif_drawnCardPutBack"]:
    extract(n)

# 搜所有含 exile 的通知订阅（setupNotifications）
print("\n\n===== setupNotifications 里的订阅 =====")
m = re.search(r"setupNotifications:function", src)
if m:
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
    print(src[brace:i + 1][:2000])
