# Adds (or updates) the Salalah screen tile on a VIDAA TV paired with Sidee.
# Run with Sidee's Python from the Sidee folder: python add_tile.py <url> [--launch]
import sys
from core import client, webui

# The launcher downloads a tile's icon only when the tile is first added; re-adding
# an existing id updates its URL but keeps the old icon. The first tile
# ("salalahscreen") was added without an image, hence a new id.
APP_ID = "salalahtv"
NAME = "شاشة صلالة"

url = sys.argv[1]
# Square launcher image published next to the page (made by tools/icon.html).
image = url.rstrip("/") + "/tile-icon.png" if url.startswith("https://") else ""
tile = {"app_id": APP_ID, "name": NAME, "url": url, "image": image}
webui._validate_preset(tile)  # same checks Sidee applies to its own presets

session = client.Session.load()
apps = client.add_tile(session, APP_ID, NAME, url, image)
ok = any(client.tile_matches_request(a, APP_ID, url) for a in apps)
print("installed" if ok else "unconfirmed", "| tiles on TV:", len(apps))
for a in apps:
    if isinstance(a, dict):
        print(" -", a.get("appId"), "|", a.get("name"), "|", a.get("url") or a.get("appUrl"))

if "--launch" in sys.argv:
    client.launch_tile(client.Session.load(), APP_ID, NAME, url)
    print("launch requested")
