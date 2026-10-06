import re

src = open(r"G:\arnak-scorer\docs\arnak.js", encoding="utf-8", errors="replace").read()

# 提取 updateResearchTrack 函数体
for m in re.finditer(r"updateResearchTrack", src):
    start = m.start()
    # 向前找函数定义起点（上一个 {）
    brace = src.rfind("{", 0, start)
    # 向后找匹配的闭合括号（简单起见取 2500 字符）
    snippet = src[brace:brace + 3000]
    print("==== snippet @", start, "====")
    print(snippet[:3000])
    print()
