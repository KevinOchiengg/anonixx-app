"""
stream_setup.py

One-time Cloudflare Stream setup: uploads the Anonixx logo as a watermark
profile and prints its uid for STREAM_WATERMARK_UID.

Placement: top-left, small and semi-transparent, so it stays clear of the
feed's right-hand rail, the caption at the bottom and any text overlays.

Needs CF_ACCOUNT_ID and CF_STREAM_TOKEN (Stream: Edit) in the environment
or Backend/.env.

Usage:
    python scripts/stream_setup.py path/to/anonixx-logo.png
    python scripts/stream_setup.py --list          # existing watermark profiles

Then set STREAM_WATERMARK_UID=<uid> on Render (and in .env for local runs).
"""
import sys

import httpx

from app.config import settings

API = f"https://api.cloudflare.com/client/v4/accounts/{settings.CF_ACCOUNT_ID}/stream/watermarks"
AUTH = {"Authorization": f"Bearer {settings.CF_STREAM_TOKEN}"}

PROFILE = {
    "name": "Anonixx",
    "position": "upperLeft",
    "scale": "0.12",     # logo width as a share of the video's width
    "opacity": "0.6",
    "padding": "0.04",
}


def main():
    if not (settings.CF_ACCOUNT_ID and settings.CF_STREAM_TOKEN):
        sys.exit("Set CF_ACCOUNT_ID and CF_STREAM_TOKEN first.")
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    if sys.argv[1] == "--list":
        r = httpx.get(API, headers=AUTH, timeout=20)
        r.raise_for_status()
        for w in r.json().get("result", []):
            print(w["uid"], w.get("name"), w.get("position"), w.get("scale"), w.get("opacity"))
        return
    path = sys.argv[1]
    with open(path, "rb") as f:
        r = httpx.post(API, headers=AUTH, data=PROFILE, files={"file": (path, f, "image/png")}, timeout=60)
    if r.status_code >= 300:
        sys.exit(f"Cloudflare refused it ({r.status_code}): {r.text[:400]}")
    uid = r.json()["result"]["uid"]
    print(f"Watermark profile created.\n\n  STREAM_WATERMARK_UID={uid}\n\nAdd that to Render and Backend/.env.")


if __name__ == "__main__":
    main()
