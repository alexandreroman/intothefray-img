---
name: "Commit messages"
description: "Commit subjects start with an imperative verb, 50 characters max; the body explains why"
type: feedback
---

# Commit messages

Commits follow the skillbox git rules: the subject starts with a verb in
the imperative mood (`Add`, `Fix`, `Remove`), is capitalized, at most 50
characters, with no trailing period; the body, after a blank line,
explains why rather than what and wraps at 72 columns. Task ids or
labels such as `T6: img skeleton` are not commit subjects.

**Why:** the user wants a history readable as "this commit will
<subject>", whatever tool made the commit.

**How to apply:** reword any tool-generated commit message before it
leaves the machine; commits directly on `main` are fine.
