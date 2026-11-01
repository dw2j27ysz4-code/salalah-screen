# Adds (or updates) a launcher tile on a VIDAA TV paired with Sidee.
# Run with Sidee's Python from the Sidee folder:
#   python add_tile.py <site-url> [--games] [--launch]
# Without --games it adds the Salalah screen; with --games, the two-player games menu.
import sys
from core import client, webui

# The launcher downloads a tile's icon only when the tile is first added; re-adding
# an existing id updates its URL but keeps the old icon. The first screen tile
# ("salalahscreen") was added without an image, hence "salalahtv".
TILES = {
    "screen": {"app_id": "salalahtv", "name": "شاشة صلالة", "path": "", "icon": "tile-icon.png"},
    "games": {"app_id": "salalahgames", "name": "ألعاب", "path": "games/", "icon": "games-icon.png"},
}

site = sys.argv[1].rstrip("/") + "/"
spec = TILES["games" if "--games" in sys.argv else "screen"]
url = site + spec["path"]
# Square launcher images are published at the site root (made by tools/icon.html).
image = site + spec["icon"] if site.startswith("https://") else ""
webui._validate_preset({"app_id": spec["app_id"], "name": spec["name"], "url": url, "image": image})

session = client.Session.load()
apps = client.add_tile(session, spec["app_id"], spec["name"], url, image)
ok = any(client.tile_matches_request(a, spec["app_id"], url) for a in apps)
print("installed" if ok else "unconfirmed", "| tiles on TV:", len(apps))
for a in apps:
    if isinstance(a, dict) and str(a.get("appId", "")).startswith("salalah"):
        print(" -", a.get("appId"), "|", a.get("name"), "|", a.get("url") or a.get("appUrl"), "| icon:", bool(a.get("httpIcon")))

if "--launch" in sys.argv:
    client.launch_tile(client.Session.load(), spec["app_id"], spec["name"], url)
    print("launch requested")
