---
name: "Cloudflare R2"
description: "R2 bucket intothefray-img behind img.intothefray.xyz; the user does the Cloudflare setup and owns the token"
type: project
---

# Cloudflare R2

The images live in the R2 bucket `intothefray-img`, served only through
the custom domain `img.intothefray.xyz` (r2.dev public access off). The
S3 endpoint is `https://<account>.r2.cloudflarestorage.com`. The R2 API
token has Object Read & Write on this bucket only and lives in the
gitignored `.env` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`).

**Why:** r2.dev is rate-limited and uncached; the custom domain goes
through Cloudflare's cache. The free tier covers the volume (about
8,400 images, 500 MB).

**How to apply:** the Cloudflare setup, the token and every `make publish`
that uploads are the user's to run or approve. Check `cf-cache-status:
HIT` on a second GET of an image. See [[project_image_rules]].
