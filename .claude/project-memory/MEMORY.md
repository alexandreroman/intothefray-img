# Project Memory

> When a new decision **contradicts** an existing
> memory note, do NOT silently override it.
> Instead: surface the conflict, quote the
> existing memory, explain how the new decision
> differs, and ask for explicit confirmation
> before updating. **Do NOT take any action** —
> no tool calls, no file writes — until confirmed.

> **Note wording** — state permanent facts in the
> present tense. A note read out of context must
> not reveal what it replaces or what just
> happened. Ban narration markers: "now", "no
> longer", "previously / used to", "reverses /
> replaces", "kept", "changed to", "reintroduce",
> "the user asked to". Phrase prohibitions
> positively ("the API is versioned under /v2"),
> not as the negation of a former state. Test:
> remove the note from its context — if a sentence
> only makes sense knowing the prior state,
> rewrite it.

- [Objective](references/project_objective.md) — card image CDN filler for intothefray, private, run locally
- [Tech stack](references/project_tech_stack.md) — TypeScript on Node 24, sharp, fflate, AWS S3 SDK, vitest
- [Image rules](references/project_image_rules.md) — source precedence, AVIF settings, assets keep orientation, explicit keys, never delete
- [Cloudflare R2](references/project_cloudflare.md) — bucket, custom domain, token in .env, setup by the user
- [Card image sources](references/reference_card_sources.md) — OCTGN Drive folders, .o8c layout, download URLs
- [Commit messages](references/feedback_commit_messages.md) — imperative subject, 50 chars, body explains why
- [Bulk downloads](references/feedback_bulk_downloads.md) — bulk downloads run via make publish/download; research uses one sample pack
