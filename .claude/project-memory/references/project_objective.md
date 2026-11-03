---
name: "Objective"
description: "Into the Fray Images fills the card image CDN of Into the Fray from the user's machine"
type: project
---

# Objective

Into the Fray Images stores the English and French Marvel Champions card scans
used by the Into the Fray app on `https://img.intothefray.xyz` (Cloudflare
R2), optimized for browsers. It is a public repository
(`alexandreroman/intothefray-img`); its one user is the app maintainer, who
runs `make publish` locally. The R2 credentials live only in the gitignored
`.env`. There is no CI job and no scheduled run. The app is the public
repository `alexandreroman/intothefray`, expected next to this one
(`APP_DIR`, default `../../intothefray`). When the app is being changed in
a task worktree, `make publish APP_DIR=<that worktree>` targets it; app
changes land in that worktree, never on the app's main checkout directly.

**Why:** French scans are not hotlinkable anywhere, and one host with
immutable, optimized images cuts the app's preload weight several times
over. A separate repo keeps the download-heavy pipeline and the R2 write
access out of the app and its CI. The user accepts that the bucket
redistributes FFG/Marvel scans publicly.

**How to apply:** a new pack or errata means `make publish`, then a review
and commit of the app diff (`packs/images/manifest.json`, `packs/dist`).
The design is in the app repo,
`docs/superpowers/specs/2026-10-25-image-cdn-design.md` (main checkout
only, gitignored). See [[project_image_rules]], [[project_cloudflare]].
