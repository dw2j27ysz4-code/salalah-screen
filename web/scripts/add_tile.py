# Adds (or updates) the Salalah screen tile on a VIDAA TV paired with Sidee.
# Run with Sidee's Python from the Sidee folder: python add_tile.py <url> [--launch]
import sys
from core import client, webui

APP_ID = "salalahscreen"
NAME = "شاشة صلالة"

url = sys.argv[1]
tile = {"app_id": APP_ID, "name": NAME, "url": url, "image": ""}
webui._validate_preset(tile)  # same checks Sidee applies to its own presets

session = client.Session.load()
apps = client.add_tile(session, APP_ID, NAME, url, "")
ok = any(client.tile_matches_request(a, APP_ID, url) for a in apps)
print("installed" if ok else "unconfirmed", "| tiles on TV:", len(apps))
for a in apps:
    if isinstance(a, dict):
        print(" -", a.get("appId"), "|", a.get("name"), "|", a.get("url") or a.get("appUrl"))

if "--launch" in sys.argv:
    client.launch_tile(client.Session.load(), APP_ID, NAME, url)
    print("launch requested")
