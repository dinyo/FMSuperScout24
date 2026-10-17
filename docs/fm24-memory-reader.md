# FM24 native reader

FM24 is read as a native 64-bit process. The roster reader opens `fm.exe` with
`PROCESS_VM_READ`, finds the person database from a code signature, reads its
`std::vector<uint64_t>` of person pointers, and classifies records through vtable
type metadata. That roster scan never writes to the game.

## Playing Time happiness (24.4.2)

The player table exports `playingTimeHappiness` as a signed integer from the
current contract at `+0x54` (range -100 to 100). The native score getter at
module RVA `0x4B66120` reads this byte; its instruction at `0x4B661D5` is checked
before using the layout. This is the stored raw score, before FM's personality
modifiers and concern rules. It is not a percentage.

`playingTimeHappinessStatus` is calculated independently of FM's UI cache.
Opening Dynamics > Happiness is no longer required. The full scan calculates
statuses only for the human manager's club. Other clubs retain their raw score
and show `Unknown (raw)`, never a label guessed from raw-score thresholds.

The recovered property path is `PHpt` -> RVA `0x4A88D00` (mode 0) -> `phms`.
The worker applies the same concern-history selection on FM's UI thread, calling
the verified native predicates and appearance-history fallback. The builder
walks the contract's `+0x28` concern-history ring: at most ten
pointers, logical start at `+0x58`; records contain reason `+0x16`, signed
severity `+0x18` and event type `+0x19`. Only active records (end date sentinel
1900/day 1) passing native predicates `0x2735890` and `0x2737920` participate.
The native fallback `0x4A8A150` considers appearance history and concern rules.
Its result is separate from the stored raw score. Category 5 (`PHtr`) is
Training, not Playing Time.

The transfer and Playing Time worker uses a short-lived Windows message hook to
execute verified routines on FM's visible game thread. The happiness path uses
FM's current contract, concern ring, native reason predicates and appearance
history routine, so archive access follows FM's normal CRT behavior. Per-player
exceptions and unsupported statuses fail closed. The worker writes only its
temporary request buffer and scratch objects into FM memory; the roster scan
itself remains read-only.

Live evaluation matched all 25 squad labels previously captured from FM, including
Concerned, Dissatisfied, Satisfied, Happy and Very Happy. Runtime calculations do
not search widgets, read `phms` caches or use screenshots/OCR. The column displays
`Dissatisfied (-96)`, for example, and sorts on the signed raw integer.

The native code was traced using [REA](https://github.com/morluto/rea) and a
read-only module snapshot. The roster scan remains read-only. Transfer and
Playing Time queries use a short-lived Windows message hook to run verified FM
routines on the UI thread; the worker writes only its temporary request buffer
and scratch objects into FM memory. See the transfer-query research for routine
checks, measured speed and fail-closed behavior when native querying is unavailable.

The address-independent scan currently uses these structures:

- `48 8D 0D ?? ?? ?? ?? 48 8D 15` locates the database root through a RIP-relative
  displacement. `personDb + 0x80` points to the person vector.
- `vtable - 8`, then `typeInfo + 4`, identifies player (`0x278` and `0x138`) and
  staff (`0xF8`) layouts. Unknown layouts fail closed instead of being guessed as
  players or staff.
- Player fields include CA/PA, attributes, positions, reputation, guide value at
  player base `+0x1D0` (`0xFFFFFFFF` means unset), contract data, transfer flags, and squad membership. The save date is resolved
  separately so ages use the in-game date.
- The separate native-query worker runs FM's transfer/loan interest filters,
  valuation range core and buyer-specific cash offer-value boundary in the game
  process through its verified hook. Playing Time happiness uses the same hook
  and native calculation path. If a route is unavailable, the worker reports an
  error. See [assembly research and runtime limits](fm24-transfer-research.md). The old
  `+0x1B0` value offset was incorrect; old dumps are not trusted for values.
- Club and team vectors provide the club catalog, division, reputation, and roster
  membership. Squad assignments are matched by person and club IDs. Senior-team
  membership is preferred over reserve/youth links when a player occurs in more
  than one squad. Reserve and youth team types remain available for My Club filters.
- The active human manager is located separately; their contract supplies My Club
  and its reputation. FM24 24.4.x staff attributes are read from `staffBase + 0x18`
  plus each attribute's mapped offset. Staff records include 23 attributes,
  including Level of Discipline at relative offset `0x04`; Discipline and Working
  With Youngsters are stored on a 1–20 scale, while the other staff attributes use
  the 1–100 scale and are divided by 5. The values were cross-checked against a live
  in-game staff profile. Staff also include contract-linked club, wage, expiry,
  recognized job roles, and staff CA/PA.

Offsets and the signature were cross-checked against the public
[fm_scouter FM24 reader](https://github.com/dgarfias/fm_scouter). Local static
inspection of Genie Scout 24 also confirmed its split 32-bit UI / 64-bit proxy
architecture and its use of Windows process-memory APIs.

One earlier audit snapshot from a 2042 save contained 91,521 players, 60,368 staff,
and 37,559 clubs.
Roster scanning matched 91,914 roster slots and assigned 90,321 distinct players
to teams. In that save, My Club was RKC Waalwijk (ID 1032), with 46 players mapped
to its senior and youth teams. These are counts from one 2042 save, not fixed
limits. Players with no active roster link may still have a club from their
contract record; the UI joins club records by ID to avoid merging same-name clubs.

Current staff roles come from the byte at `contract + 0x1C` when an active contract exists.
For staff without a readable contract, the reader checks the first role-list entry
at `person + 0xD0` → first entry `+0x10` → role byte `+0x1C`. Recognized enum values
are shown with their role name. If that entry links to an unnamed national team, its
country ID is kept separately so the UI can show the national-team employer and avoid
marking the staff member as a free agent. The preferred job is read from the staff
record at `staffBase + 0xDA`; the UI shows it separately from the current role so
recruitment does not rely on an attribute-based recommendation. Entries without a
readable job keep a generic role. The mapping labels ID 10 as Director of Football
and ID 88 as Technical Director. The FM24 transfer flags are read from
`contract + 0x48`; bit 0 is not a transfer-list flag.

FMF shortlist import/export remains a separate file workflow. Live in-game shortlist
sync is available through the native reader: open FM24 on **Scouting > Shortlist**
before pressing the app button. The reader locates FM24's native person table,
uses the FM24 build-specific active-shortlist pointer signature (with the local
Genie Scout 24 layout as a cross-check), validates IDs against live player objects,
and falls back to the row/vector detector for unsupported builds. This follows the
shortlist currently shown in the game, including custom shortlists and lists that
shrink to one or zero players. After the first successful direct scan, the validated
pointer is cached per FM24 PID so subsequent refreshes avoid rescanning the process
heap. The memory
probe is read-only; it does not write to FM24. The local Genie Scout 24 installation
was used as a layout cross-check, including its `FindShortlistOffset`/
`ReadUniqueIDList` operations and split 32/64-bit reader architecture.

For a new game patch, the reader fails closed if it cannot find the person vector
or a known player type. Scan counts and discovered layouts are recorded in
`%LOCALAPPDATA%\FMSuperScout\diagnostics.txt`.

## Staff job interests

Staff preferences are read from the full 15-byte `JOB_PREFERENCES` record,
resolved through the staff virtual base. An unset cached job no longer hides the
preferred role of unemployed staff. Profiles show every raw interest group and
score; the current contract role remains separate. See
[staff job-interest layout and REA evidence](fm24-staff-job-interests.md).
