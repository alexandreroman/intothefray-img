---
name: "Bulk downloads"
description: "Drive packs and card scans are bulk-downloaded only by a real make publish run"
type: feedback
---

# Bulk downloads

Research and tests download at most a single sample pack; the full set of
Drive packs and card scans is fetched only by a real `make publish`.

**Why:** the sources are third-party hosts with quotas, and the publish
cache makes one full run enough.

**How to apply:** use small fixtures in tests and a single pack for any
spike. See [[reference_card_sources]].
