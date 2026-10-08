#!/bin/sh
set -eu
node --test scripts/scanner-ocr.test.mjs scripts/scanner-vision.test.mjs && mkdir -p public/data && cp data/vision-index.json public/data/ && cp index.html scanner.js scanner-ocr.js scanner-vision.js image-visibility.js proxy-generator.js deck-image-share.js collection-history.js public/
