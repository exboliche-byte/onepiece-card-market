#!/usr/bin/env python3
"""Build a tiny visual fingerprint index without redistributing artwork.

Takes card identities from the existing catalogue. Fetches only missing images,
computes 256-bit dHash for artwork and complete-card views, and discards images.
Uses Pillow and aiohttp, both only in GitHub Actions, never on user devices.
"""
import asyncio
import io
import json
import os
from pathlib import Path
from urllib.parse import quote

import aiohttp
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "cards.json"
INDEX = ROOT / "data" / "vision-index.json"
HEADERS = {"User-Agent": "MiAlbumOnePiece-VisionIndexer/1.0 (public one-piece card lookup)"}
CONCURRENCY = 14


def dhash(image, region):
    w, h = image.size
    x1, y1, x2, y2 = region
    left, top, right, bottom = (int(w*x1), int(h*y1), max(1,int(w*x2)), max(1,int(h*y2)))
    resized = ImageOps.grayscale(image.crop((left, top, right, bottom))).resize(
        (17, 16), Image.Resampling.BILINEAR)
    pixels = list(resized.getdata())
    value = 0
    for row in range(16):
        for col in range(16):
            value = (value << 1) | int(pixels[row * 17 + col] > pixels[row * 17 + col + 1])
    return f"{value:064x}"


def fingerprint(data):
    with Image.open(io.BytesIO(data)) as img:
        img = ImageOps.exif_transpose(img)
        if img.width < 100 or img.height < 100:
            raise ValueError("reference too small")
        img.load()
        return [dhash(img, (.05, .1, .95, .72)),
                dhash(img, (.06, .06, .94, .94))]


def names_for(card):
    id_ = str(card.get("id") or "").strip()
    if not id_ or not (id_.startswith(("OP", "ST", "EB", "PRB", "P-", "DON"))):
        return []
    # Prefer the exact official print ID, not the base of a parallel.
    paths = [
        "https://en.onepiece-cardgame.com/images/cardlist/card/" + quote(id_, safe="-_") + ".png",
        "https://optcg-api.arjunbansal-ai.workers.dev/images/" + quote(id_, safe="-_")
    ]
    image = str(card.get("image") or card.get("imageUrl") or "")
    if image.startswith("https://") and image not in paths:
        paths.insert(0, image)
    return paths


async def index_one(session, semaphore, item):
    card_id, urls = item
    async with semaphore:
        for url in urls:
            for attempt in range(2):
                try:
                    async with session.get(url, headers=HEADERS,
                                           timeout=aiohttp.ClientTimeout(total=9)) as resp:
                        if resp.status == 404:
                            break
                        if resp.status != 200:
                            if resp.status in (429, 500, 502, 503) and attempt == 0:
                                await asyncio.sleep(.5)
                                continue
                            break
                        if not str(resp.headers.get("Content-Type", "")).lower().startswith("image/"):
                            break
                        raw = await resp.read()
                        if len(raw) > 6_000_000:
                            break
                        return card_id, await asyncio.to_thread(fingerprint, raw)
                except (aiohttp.ClientError, asyncio.TimeoutError, ValueError, OSError):
                    pass
        return card_id, None


async def build():
    cards = json.loads(CATALOG.read_text(encoding="utf-8"))
    if isinstance(cards, dict):
        cards = list(cards.values())
    ids = {}
    for card in cards:
        if not isinstance(card, dict):
            continue
        cid = str(card.get("id") or "").strip()
        if cid and cid not in ids:
            ids[cid] = names_for(card)
    old = {}
    if INDEX.exists():
        try:
            raw = json.loads(INDEX.read_text(encoding="utf-8"))
            if raw.get("version") == 1:
                old = {row[0]:row[1:3] for row in raw.get("cards", [])
                       if isinstance(row,list) and len(row)==3}
        except (ValueError, TypeError):
            pass
    missing = [(cid, urls) for cid, urls in ids.items() if urls and cid not in old]
    print(f"Catalog: {len(ids)} IDs; cached: {len(old)}; to fetch: {len(missing)}", flush=True)
    if missing:
        connector = aiohttp.TCPConnector(limit=CONCURRENCY, limit_per_host=CONCURRENCY)
        async with aiohttp.ClientSession(connector=connector) as session:
            semaphore = asyncio.Semaphore(CONCURRENCY)
            tasks = [asyncio.create_task(index_one(session, semaphore, item)) for item in missing]
            seen = 0
            for task in asyncio.as_completed(tasks):
                cid, hashes = await task
                seen += 1
                if hashes:
                    old[cid] = hashes
                if seen % 200 == 0:
                    print(f"Images tried: {seen}/{len(missing)}, indexed: {len(old)}", flush=True)
    rows = [[cid, *old[cid]] for cid in sorted(ids) if cid in old]
    # A tiny partial index would mislead users into believing the entire catalog
    # has image coverage. Fail rather than publish an unusable file.
    if len(rows) < 750:
        raise RuntimeError(f"Too few reference artworks to publish: {len(rows)}")
    INDEX.write_text(json.dumps({"version": 1, "cards": rows}, separators=(",", ":")) + "\n")
    print(f"Saved {len(rows)} visual reference fingerprints; file {INDEX.stat().st_size} bytes", flush=True)


if __name__ == "__main__":
    asyncio.run(build())
