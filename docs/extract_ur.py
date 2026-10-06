import re

src = open(r"G:\arnak-scorer\docs\arnak.js", encoding="utf-8", errors="replace").read()

m = re.search(r"updateResources:function", src)
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
print("===== updateResources =====")
print(src[brace:i + 1][:2500])
