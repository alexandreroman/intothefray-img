---
name: "Bulk downloads"
description: "Drive packs and card scans are bulk-downloaded only by the make publish and make download targets the user runs"
type: feedback
---

# Bulk downloads

Bulk downloads of Drive packs and card scans go through the make targets
the user runs, `make publish` and `make download`. Research and tests use
at most one sample pack.

**Why:** the sources are third-party hosts with quotas, and the cache
makes one full run enough.

**How to apply:** use small fixtures in tests and a single pack for any
spike; leave full runs of `make publish` and `make download` to the user.
See [[reference_card_sources]].
