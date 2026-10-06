import urllib.request
import os

url = "https://filemanager.czechgames.com/storage/files/lost-ruins-of-arnak/rules/lost-ruins-of-arnak-rules-en.pdf"
dest = r"G:\arnak-scorer\docs\arnak-rules-en.pdf"

req = urllib.request.Request(url, headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/pdf,*/*",
})
with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
    data = r.read()
    f.write(data)
    print("downloaded", len(data), "bytes")
print("header:", open(dest, "rb").read(8))
