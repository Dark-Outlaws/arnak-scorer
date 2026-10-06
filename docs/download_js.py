import urllib.request

url = "https://x.boardgamearena.net/data/themereleases/current/games/arnak/260708-1244/arnak.js"
dest = r"G:\arnak-scorer\docs\arnak.js"

req = urllib.request.Request(url, headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "*/*",
})
with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
    data = r.read()
    f.write(data)
    print("downloaded", len(data), "bytes")
print("first line:", open(dest, "r", encoding="utf-8", errors="replace").readline()[:200])
