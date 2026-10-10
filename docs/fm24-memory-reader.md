# FM24 native reader

FM24 is read as a native 64-bit process. The reader opens `fm.exe` with
`PROCESS_VM_READ`, finds the person database from a code signature, reads its
`std::vector<uint64_t>` of person pointers, and classifies records through vtable
type metadata. The reader never writes to the game.

The address-independent scan currently uses these structures:

- `48 8D 0D ?? ?? ?? ?? 48 8D 15` locates the database root through a RIP-relative
  displacement. `personDb + 0x80` points to the person vector.
- `vtable - 8`, then `typeInfo + 4`, identifies player (`0x278` and `0x138`) and
  staff (`0xF8`) layouts. Unknown layouts fail closed instead of being guessed as
  players or staff.
- Player fields include CA/PA, attributes, positions, reputation, guide value,
  contract data, transfer flags, and squad membership. The save date is resolved
  separately so ages use the in-game date.
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

Staff roles come from the byte at `contract + 0x1C`. Recognized enum values are
shown with their role name; entries without a readable contract or known enum keep
an unknown/generic role. The mapping labels ID 10 as Director of Football and ID
88 as Technical Director. The FM24 transfer flags are read from
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
