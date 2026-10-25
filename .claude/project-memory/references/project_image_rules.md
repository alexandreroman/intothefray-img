---
name: "Image rules"
description: "Source precedence, normalization, AVIF settings, key format and bucket policy of the published images"
type: project
---

# Image rules

- English: the first source that loads among Cerebro, the OCTGN English
  scan, then the image of the card's source record (marvelcdb, or mc4db
  for fallback cards). French: the OCTGN French scan only; without one the
  face has no French entry and the client falls back to English. Jessica
  Jones and Luke Cage have no OCTGN pack, so they are English only.
- Official OCTGN packs only: a leading number below 997 and no " - FM - ".
  Packs apply in number order, so the errata pack (990) wins.
- Normalize in order: EXIF rotation, a landscape face stored portrait
  turns a quarter clockwise, conversion to sRGB, short edge at most
  600 px and never enlarged, AVIF quality 55, effort 6, no metadata.
- Keys: `<lang>/<code>.<first 12 hex of the AVIF sha256>.avif`; assets
  (`back-player`, `back-encounter`, `back-villain`, `first-player`) use
  fixed keys `assets/<name>.avif`. Uploads carry
  `Content-Type: image/avif` and
  `Cache-Control: public, max-age=31536000, immutable`.
- Objects are never deleted, so every past app commit's URLs keep
  working. The manifest is written only after every upload succeeds.

**Why:** content-addressed, immutable keys let browsers and Cloudflare
cache forever; 600 px covers the 298 px preview at 2x.

**How to apply:** a changed asset gets a new name. Out of scope: WebP,
several sizes, srcset, fan-made packs, Hall of Heroes, cgbuilder.fr. See
[[project_objective]], [[reference_card_sources]].
