# intothefray-img

Private tool that publishes the card images of
[intothefray](https://github.com/alexandreroman/intothefray) to
`https://img.intothefray.xyz`.

`make publish` downloads the English and French card scans, optimizes
them, uploads the new ones to a Cloudflare R2 bucket and writes the
app's image manifest. The app then loads every card image, card back and
theme image from that domain.

What it does, in order:

1. Reads `packs/images/sources.json` from the app, which lists every
   card face and its source images (Cerebro, marvelcdb or mc4db, and the
   OCTGN stem).
2. Downloads the English and French OCTGN packs from Google Drive, and
   the source images over HTTP. Downloads are cached under `.cache/`.
3. Reads each `.o8c` pack (a zip archive) and picks the English image
   by precedence: Cerebro, then OCTGN EN, then the source record. The
   French image is the OCTGN FR image, if any.
4. Normalizes each image (EXIF rotation, orientation turn, sRGB, short
   edge at most 600 px, never enlarged) and encodes it as AVIF. A
   portrait image of a landscape face turns a quarter clockwise; a
   landscape image of a portrait face turns a quarter counter-clockwise
   (the OCTGN French scans of 56128b and 56206b are stored that way) and
   is listed in the report for review.
5. Lists the bucket once and uploads only the keys it lacks. Face keys
   are `cards/<lang>/<code>.<sha256 hex[:12]>.avif`, so a URL never
   changes its content, and an unchanged image is never uploaded again.
6. Writes `packs/images/manifest.json` in the app, last.

Objects are never deleted from the bucket.

## Cloudflare setup (once)

Done once by hand.

1. Enable R2 on the account. The dashboard may ask for a payment
   method, even on the free tier.
2. Create the bucket: `wrangler r2 bucket create intothefray-img`.
3. Connect the custom domain `img.intothefray.xyz` (bucket, Settings,
   Custom Domains). Leave r2.dev public access off.
4. Caching: see [CDN cache](#cdn-cache) below.
5. Create an R2 API token with Object Read & Write on this bucket only,
   and put it in `.env`.

## Configuration

Copy `.env.example` to `.env` (gitignored) and fill it in. `src/publish.ts`
reads it at startup; variables already set in the environment win:

- `R2_ACCOUNT_ID`: the Cloudflare account id. The endpoint is
  `https://<account>.r2.cloudflarestorage.com`.
- `R2_ACCESS_KEY_ID`: the R2 API token's access key id.
- `R2_SECRET_ACCESS_KEY`: the R2 API token's secret.
- `R2_BUCKET`: the bucket name, `intothefray-img`.

## Setup

Tools are pinned in `mise.toml`: Node 24.22.0 and pnpm 12.14.0.

    mise install
    make install

## Publish

    make publish

`make publish` runs, in order:

1. `make -C $(APP_DIR) sources`, which writes
   `packs/images/sources.json` in the app.
2. `node src/publish.ts --app-dir $(APP_DIR)`, which does the steps
   above.
3. `make -C $(APP_DIR) packs`, which writes `packs/dist` from the
   manifest.

The report ends with `to upload: N of TOTAL keys (M already in the
bucket)`. A rerun with nothing new encodes nothing and uploads 0 keys.

`make publish DRY_RUN=1` runs everything except the uploads, the
manifest write and the app `packs` step, and prints each key it would
upload.

### App location

`APP_DIR` defaults to `../../intothefray`. Override it on the command
line, for example `make publish APP_DIR=/path/to/intothefray`. When the
app is being changed in a task worktree, `make publish APP_DIR=<that
worktree>` targets it: app changes land in that worktree and never on
the app's main checkout directly.

### Review and commit

Review the diff in the app and commit it. The commit carries the
manifest, `sources.json` and the regenerated `packs/dist`. Push it only
after `make publish` has uploaded every key in the manifest.

A new pack or errata is the same flow: run `make publish`, review,
commit. New Drive files are downloaded automatically.

## Download packs

    make download
    make download PACK=060
    make download PACK=060 LANG=fr

`make download` fetches every official EN and FR pack missing from
`.cache/o8c/`, without encoding or uploading. `PACK=<number>` downloads
that pack again even when cached, for example after a pack was
republished on Drive. `LANG=en` or `LANG=fr` limits it to one language;
both by default. An unknown pack number fails before any download.

## Caches

### Local cache

    make refresh
    make refresh CACHE=o8c

`.cache/` holds three caches: `o8c/` (Drive packs), `http/` (source
images) and `avif/` (encoded files). `make refresh` empties all of them;
`CACHE=o8c|http|avif` empties only that one. The next `make publish`
fills them again.

### CDN cache

    make verify-cdn
    make verify-cdn KEY=assets/back-player.avif

`make verify-cdn` does two GETs on `https://img.intothefray.xyz/<KEY>`
with curl and prints the status, `content-type`, `cache-control` and
`cf-cache-status` of each. It fails unless the second answer is `HIT`
and `cache-control` is `public, max-age=31536000, immutable`. `KEY`
defaults to a key of the app manifest, else `assets/back-player.avif`.

On the Cloudflare side:

- AVIF is in Cloudflare's default cached extensions, so no rule is
  needed when `verify-cdn` reports `HIT`.
- Only if it reports `MISS` or `DYNAMIC` on the second GET, add a Cache
  Rule for the hostname `img.intothefray.xyz`: cache eligibility "Eligible
  for cache" (cache everything), Edge TTL "Use cache-control header if
  present" (respect origin).
- Keep Browser TTL on "Respect existing headers", so browsers keep the
  objects' `immutable` year.

## Rollback

Revert the app commit. The app serves its old packs again, which link
the original image sources. Bucket objects are never deleted, so the
URLs of past commits keep working, and the bucket is left as is.

## Make targets

Run `make` to list them.

- `make install`: installs the dependencies from the lockfile.
- `make download [PACK=<number>] [LANG=en|fr]`: downloads the missing
  packs, or forces one pack.
- `make publish [DRY_RUN=1] [APP_DIR=<dir>]`: the full publish flow
  described above.
- `make refresh [CACHE=o8c|http|avif]`: empties `.cache/` or one cache.
- `make verify-cdn [KEY=<key>]`: checks the CDN caches an image.
- `make test`: runs the vitest suite (`pnpm test`).
- `make check`: type-checks with `tsc` and runs the test suite.

## License

Apache-2.0, see [LICENSE](LICENSE).
