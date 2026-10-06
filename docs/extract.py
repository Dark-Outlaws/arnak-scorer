from pypdf import PdfReader

r = PdfReader(r"G:\arnak-scorer\docs\arnak-rules-en.pdf")
with open(r"G:\arnak-scorer\docs\rules-text.txt", "w", encoding="utf-8") as f:
    for i, page in enumerate(r.pages, 1):
        f.write(f"\n===== PAGE {i} =====\n")
        f.write(page.extract_text() or "")
print("pages:", len(r.pages))
