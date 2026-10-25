---
name: "Card image sources"
description: "Where the OCTGN image packs live on Google Drive, how to download them and how .o8c archives are laid out"
type: reference
---

# Card image sources

- OCTGN image packs: Google Drive folders, English
  `1tp3ue360TCW9fSlfdiJole0hBCDAkQB6`, French
  `1Bjn1_GnHFpQ2LvgXXgq106dy824REEvv`. Listing without auth:
  `https://drive.google.com/embeddedfolderview?id=<folder>`.
  Download:
  `https://drive.usercontent.google.com/download?id=<id>&export=download&confirm=t`.
- `.o8c` files are zip archives; card images are at
  `055c536f-adba-4bc2-acbf-9aefb9756046/Sets/<setGuid>/Cards/<cardGuid>.jpg`
  (plus a `Thumbs.db` to skip). The card GUID is the `octgn_id` of the
  marvelcdb and mc4db records; faces of a card share it.
- File names vary (`.o8c.o8c`, `- fr.o8c`, dated suffixes): select by
  the leading pack number only.
- Some French scans are CMYK JPEGs without an ICC profile.

**Why:** these sources are not discoverable from the code alone, and
Drive may answer with an HTML quota page instead of a zip.

**How to access:** the app repo writes the per-face candidate URLs in
`packs/images/sources.json` (`make sources` there). See
[[project_image_rules]].
