One file per reel, written by `node engine/reel.mjs review <slug>`:

- `<slug>.json` — the reel: title, current version, status, and one entry per version with its
  preview, cuts, effect markers and caption lines.
- `<slug>.notes.json` — your notes, written by the review page. Claude reads this file, fixes each
  note and replies on it. Safe to read, best not to hand-edit while the page is open.
