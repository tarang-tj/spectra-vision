#!/bin/sh
# Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved.
# Makes the demo stills a small screen is sent (src/vision/demo-picture.ts):
# each PNG under public/demo re-encoded as WebP, 1280 px wide at most. Run by
# hand when a demo still changes, then commit the files. Needs cwebp.
# usage: scripts/phone-demo-pictures.sh [quality, 82 when not given]
set -e
cd "$(dirname "$0")/../public/demo"
quality="${1:-82}"
for name in studio hands face face-and-hands; do
  width=$(file "$name.png" | sed -E 's/.* ([0-9]+) x [0-9]+.*/\1/')
  if [ "$width" -gt 1280 ]; then
    cwebp -quiet -q "$quality" -resize 1280 0 "$name.png" -o "$name-phone.webp"
  else
    cwebp -quiet -q "$quality" "$name.png" -o "$name-phone.webp"
  fi
  echo "$name-phone.webp $(wc -c < "$name-phone.webp" | tr -d ' ') bytes (from $width px wide, quality $quality)"
done
