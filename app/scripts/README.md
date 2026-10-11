# Frontend scripts

The frontend is split by feature and keeps the existing zero-dependency, classic-script startup.
Scripts share app state and load in the order listed in index.html.

| File                                    | Responsibility                                        |
| --------------------------------------- | ----------------------------------------------------- |
| 00-state-and-text.js                    | Shared state, constants, and English UI copy          |
| 01-presentation-and-history.js          | Formatting, player estimates, and development history |
| 02-player-models.js                     | Attribute filters and player/staff models             |
| 03-data-loading.js                     | Dump loading, normalization, and saved settings       |
| 04-filters.js                          | Player filters, active chips, and presets             |
| 05-table.js                            | Table columns, sorting, and visible rows              |
| 06-shortlist-and-clipboard.js          | Shortlist operations and clipboard export             |
| 07-player-profile.js                   | Player detail and profile view                        |
| 08-app-services.js                     | Shared UI services, help, and status                  |
| 09-best-xi.js                          | Best XI builder and club list                         |
| 10-club-and-squad-analysis.js          | Club comparison and squad analysis                    |
| 11-meta-preset-and-weight-editor.js    | Meta preset controls and the weight editor            |
| 12-ui-controls.js                      | Event wiring, view changes, and app startup           |

Keep core data and model helpers before the scripts that render their features.
