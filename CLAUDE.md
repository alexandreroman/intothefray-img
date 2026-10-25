# intothefray-img

Private tool that publishes the card images of intothefray to
`img.intothefray.xyz` (Cloudflare R2, AVIF).

See [README.md](README.md) for full documentation.

## Tech stack

- TypeScript on Node 24, run directly (type stripping)
- pnpm, vitest
- sharp (AVIF encoding, CMYK to sRGB), fflate (`.o8c` zip)
- @aws-sdk/client-s3 (R2 through the S3 API)

## Build & run

```sh
make install   # pnpm install --frozen-lockfile
make check     # tsc --noEmit, then the test suite
make test      # vitest suite only
make publish   # sync sources, upload new images, write manifest
make refresh   # empty .cache/
```

## Modules

- `src/types.ts`: shared types (source face, encoded entry, manifest)
- `src/drive.ts`: Drive listing parse and official pack selection
- `src/o8c.ts`: reads the images of an `.o8c` pack
- `src/encode.ts`: normalizes images and builds content-addressed keys
- `src/http.ts`: downloads source images, cached by URL hash
- `src/resolve.ts`: picks the English and French image of each face
- `src/r2.ts`: lists the bucket and uploads the missing keys
- `src/publish.ts`: the publish flow that ties the modules together

## Agents

Use the following agents (from the
[skillbox](https://github.com/alexandreroman/skillbox)
plugin) for all code tasks:

- **code-writer** — for ANY task that writes,
  modifies, or refactors code. This includes
  one-line fixes, import changes, visibility
  tweaks, and adding assertions. Never edit
  source files directly — always delegate to
  this agent.
- **code-reviewer** — for read-only code review
  before merging or when investigating issues.

## Memory

At the start of every conversation, read
`.claude/project-memory/MEMORY.md` to load
project context from previous conversations.

Use the **project-memory** skill (from the
[skillbox](https://github.com/alexandreroman/skillbox)
plugin) proactively — without being asked — whenever
the conversation reveals project decisions, deadlines,
team context, external references, workflow preferences,
or corrective feedback worth persisting across
conversations.

**Important:** Always use the **project-memory**
skill to persist information. Never use the built-in
auto-memory system (`~/.claude/projects/.../memory/`)
for project decisions or context — it is local and
not shared with the team.

## Conventions

- Line length limits for readability:
  - Text / Markdown: 80 columns max
  - Code: 120 columns max
- Follow standard Markdown conventions: blank line
  before and after headings, blank line before and
  after lists, fenced code blocks with a language tag
- Always use the latest LTS or stable version of
  languages, frameworks, and libraries. Check the
  official documentation or use available tools
  (e.g. context7) to verify current versions before
  choosing a dependency.

## Project rules

- No network in tests: use fixtures and fake clients.
- Never delete bucket objects. Keys are content-addressed,
  and past URLs must keep working.
- `.env` holds the R2 credentials and is gitignored. Never
  commit it.
- Bulk downloads (Drive packs, source images) run only
  through `make publish`.
