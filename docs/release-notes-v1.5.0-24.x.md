# FMSuperScout 24 1.5.0-24.x

## 1.5.0-24.3

- Read FM value ranges, transfer or loan interest, and verified AI minimum cash bids for
  the current results or selected players. Reads start only when requested, run in bounded
  batches, and can be paused after the current batch. The original stored guide value has
  its own column; unavailable results stay unknown instead of using estimates.
- These calculations require the supported FM24 executable and a visible game window.
  The bundled hook runs verified routines inside FM on its UI thread. The main memory
  dump remains read-only. Minimum cash bids are checks of AI offer acceptance, not a
  guarantee of a completed transfer or agreed player contract.
- My Players shows Playing Time happiness scores and native status labels when available.
  The Unhappy Playing Time XI places the least happy eligible players without duplicates.
- Calculate Best XI scores and formations for displayed clubs and open their lineup details.
  Expanded formation presets and updated pitch and remaining-player layouts improve comparison.
- Staff now distinguish preferred job from current role; national-team staff show their team.
  Unemployed staff with an unset cached job use their full FM job-interest list, so
  Dylan Rousselle correctly appears as Head of Youth Development. Profiles show
  the raw interest groups and scores, and analytical roles have explicit labels.
- Builds include the native-query runtime and licenses and use a pinned, checksum-verified
  Node.js runtime. Formula recovery notes and an interest-threshold utility document research.
- Fixed the stored guide-value offset, fatal native errors showing zero-price data,
  filter results remaining hidden after a native-query failure, transfer/loan
  interest-filter availability, and stale club details replacing player profiles.

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
- In releases through 24.2, the reader's guide value is treated as market value and the
  displayed transfer fee is an estimate. The upcoming changes above replace that behavior.

## Refinements

- Player filters, sorting, Best XI formation evaluation, club search and history lookups
  reuse computed data to reduce repeated work on large saves.
- Filter settings are saved separately for player, staff, shortlist and My Player views.
  Stored scouting data can be cleared from the app.
- Club balances and budgets preserve negative values. Reserve team type 30 is classified
  as a reserve squad.
- FMF shortlist export falls back to a browser download when the save-file picker is not
  available. CSV shortlist export has been removed.
