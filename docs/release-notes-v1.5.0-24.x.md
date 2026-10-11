# FMSuperScout 24 1.5.0-24.x

FM24 edition updates from 1.5.0-24.0 through 1.5.0-24.2.

## FM24 data and shortlist

- Replaced the FM26 plugin data path with a native, read-only FM24 memory reader. It
  reads players, staff, clubs, squads, contracts, position proficiency and club finances,
  with scan progress and diagnostics.
- Sync the active FM24 shortlist from **Scouting > Shortlist**, or import and export FM
  shortlists as `.fmf` files. Export uses FM24's version 8 format; import supports
  versions 7 and 8.
- The FM24 installer, shortcuts, updater assets, server port and data folders are separate
  from the original edition, so both editions can be installed side by side.
- Shortlist IDs are validated against available players, duplicates are avoided during
  import, and shortlist sync can add newly detected player rows immediately.

## Scouting tools

- Build a Best XI or cover XI with a built-in or custom formation. The app assigns each
  player once using position-specific Meta and a configurable proficiency threshold.
  Team-group filters cover first team, reserves and youth.
- Explore clubs with searchable and sortable data, plus filters for reputation, finances,
  transfer and wage budgets, and training and youth facilities.
- Compare squad positions and potential against the shortlist. Analysis supports team
  filters and proficiency thresholds; shortlist comparisons default to first-team players.
- My Player filters to your club and can show first-team, reserve or youth players. Bulk
  selection makes it quicker to add players to the app shortlist.
- Staff search includes advanced attribute filters, estimated training stars and a filter
  for recruitable roles.

## Meta, search and languages

- Edit Meta weights, select a position for a player's Meta score, and import or reset JSON
  presets. Presets include the Direct weights, goalkeeper-calibrated Direct weights and
  the FMSuperScout New Method, which blends normalized outfield tests and keeper studies.
- Meta and PA Meta display raw position scores. The normalized percentage option introduced
  in 24.1 has been removed in 24.2.
- Search ignores accents in player, club, competition, nationality and attribute names.
- Dutch, English, French and German translations cover the updated interface and filters.
- The reader's guide value is treated as market value; the displayed transfer fee remains
  an estimate because FM determines the asking price during negotiations.

## Refinements

- Player filters, sorting, Best XI formation evaluation, club search and history lookups
  reuse computed data to reduce repeated work on large saves.
- Filter settings are saved separately for player, staff, shortlist and My Player views.
  Stored scouting data can be cleared from the app.
- Club balances and budgets preserve negative values. Reserve team type 30 is classified
  as a reserve squad.
- FMF shortlist export falls back to a browser download when the save-file picker is not
  available. CSV shortlist export has been removed.
