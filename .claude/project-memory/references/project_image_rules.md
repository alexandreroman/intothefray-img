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
- An HTTP source has no image on 403, 404, 410 or a non-image 200; 429
  and 5xx retry with backoff, then fail the run, so a transient error
  never switches a face to another source.
- Official OCTGN packs only: a leading number below 997 and no " - FM - ".
  Packs apply in number order, so the errata pack (990) wins.
- Normalize in order: EXIF rotation, a landscape face stored portrait
  turns a quarter clockwise, a portrait face stored landscape turns a
  quarter counter-clockwise, conversion to sRGB, short edge at most
  600 px and never enlarged, AVIF quality 55, effort 6, no metadata.
  The two quarter turns apply to card faces only: assets (backs, the
  landscape first player token) keep their source orientation
  (`normalize(input, null)`).
  The OCTGN French scans of 56128b and 56206b are portrait cards stored a
  quarter clockwise. Each portrait face with a landscape image is listed
  in the report ("landscape image on portrait face") for review.
- `SETTINGS_VERSION` in `src/encode.ts` is part of the encode cache key;
  every change to the normalization bumps it.
- Face keys: `cards/<lang>/<code>.<first 12 hex of the AVIF sha256>.avif`;
  each asset has an explicit, human-chosen key in `DEFAULT_ASSETS`
  (`src/publish.ts`): `assets/back-player.avif`,
  `assets/back-encounter.avif`, `assets/back-villain.avif` and
  `assets/first-player-v2.avif` (`assets/first-player.avif` holds a
  token turned a quarter and stays in the bucket). The app hardcodes
  these keys in `web/src/table/theme.ts`. Uploads carry
  `Content-Type: image/avif` and
  `Cache-Control: public, max-age=31536000, immutable`.
- Objects are never deleted, so every past app commit's URLs keep
  working. The manifest is written only after every upload succeeds.
- The app loads every image from `img.intothefray.xyz` only, with no
  fallback to another host, so every face it shows must be published;
  `make publish` is the fix for a missing image.

**Why:** content-addressed, immutable keys let browsers and Cloudflare
cache forever; 600 px covers the 298 px preview at 2x.

**How to apply:** a changed asset gets a new key (`-v2`, `-v3`, ...)
in `DEFAULT_ASSETS` and in the app's `theme.ts`, since a published key
is immutable and `make publish` skips keys already in the bucket.
Out of scope: WebP, several sizes, srcset, fan-made packs, Hall of
Heroes, cgbuilder.fr. See [[project_objective]],
[[reference_card_sources]].
