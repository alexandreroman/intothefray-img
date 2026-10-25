---
name: "Tech stack"
description: "TypeScript on Node 24 with type stripping, pnpm, vitest, sharp, fflate, @aws-sdk/client-s3"
type: project
---

# Tech stack

TypeScript run directly by Node 24 (type stripping, no build step), pnpm,
vitest, `sharp` for decoding, color conversion and AVIF, `fflate` for the
`.o8c` zip archives, and `@aws-sdk/client-s3` for R2. `mise.toml` pins the
same node and pnpm versions as the app.

**Why:** sharp bundles libvips, which handles CMYK JPEGs without an ICC
profile, rotation and AVIF encoding in one dependency; TypeScript matches
the app's web stack.

**How to apply:** use the latest stable versions of these dependencies;
tests use fixtures and fakes, never the network. See [[project_objective]].
