#!/bin/sh
set -eu
node --check scripts/update-cardmarket-prices.mjs && node --test scripts/scanner-ocr.test.mjs scripts/scanner-vision.test.mjs scripts/catalog-guard.test.cjs scripts/expansion-aliases.test.cjs scripts/resolve-ambiguous-prices.test.cjs && mkdir -p public/data && cp data/vision-index.json public/data/ && cp index.html scanner.js scanner-ocr.js scanner-vision.js image-visibility.js proxy-generator.js deck-image-share.js collection-history.js tournaments.js meta.js public/
