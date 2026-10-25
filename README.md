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
4. Normalizes each image (EXIF rotation, landscape turn, sRGB, short
   edge at most 600 px, never enlarged) and encodes it as AVIF.
5. Lists the bucket and uploads the keys it lacks. Keys are
   `<lang>/<code>.<sha256 hex[:12]>.avif`, so a URL never changes its
   content.
6. Writes `packs/images/manifest.json` in the app, last.

Objects are never deleted from the bucket.

## Cloudflare setup (once)

Done once by hand.

1. Enable R2 on the account. The dashboard may ask for a payment
   method, even on the free tier.
2. Create the bucket: `wrangler r2 bucket create intothefray-img`.
3. Connect the custom domain `img.intothefray.xyz` (bucket, Settings,
   Custom Domains). Leave r2.dev public access off.
4. Caching: AVIF is in Cloudflare's default cached extensions, and the
   objects carry `immutable`. Check `cf-cache-status: HIT` on a second
   GET. Add a Cache Rule only if it misses.
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
2. `node src/publish.ts $(APP_DIR)`, which does the steps above.
3. `make -C $(APP_DIR) packs`, which writes `packs/dist` from the
   manifest.

`APP_DIR` defaults to `../../intothefray`. Override it on the command
line, for example `make publish APP_DIR=/path/to/intothefray`.

Then review the diff in the app and commit it. The commit carries the
manifest, `sources.json` and the regenerated `packs/dist`. Push it only
after `make publish` has uploaded every key in the manifest.

A new pack or errata is the same flow: run `make publish`, review,
commit. New Drive files are downloaded automatically.

## Refresh

    make refresh

Empties `.cache/`. The next `make publish` downloads everything again.

## Rollback

Revert the app commit. The app serves its old packs again, which link
the original image sources. Bucket objects are never deleted, so the
URLs of past commits keep working, and the bucket is left as is.

## Make targets

- `make publish`: the full publish flow described above.
- `make refresh`: empties `.cache/`.
- `make test`: runs the vitest suite (`pnpm test`).
- `make check`: type-checks with `tsc` and runs the test suite.
