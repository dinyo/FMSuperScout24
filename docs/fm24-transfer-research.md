# FM24 native transfer queries

For the attempt to recover standalone JavaScript formulas, see
[FM24 formula recovery](fm24-formula-recovery.md). It records the verified
threshold arithmetic, decompiler/call-trace evidence, and why full calculation
parity is still unproven.

## Scope

The table now asks FM's own routines for the active human manager's transfer or
loan interest, displayed valuation range, and cash-bid value boundary. The latter
means the cash amount the AI offer-value evaluator accepts without increasing
the bid or adding clauses. It is not a club's listed asking price. Embargoes,
availability and other policy checks can still prevent the transfer; player
interest and contract agreement are separate.

The preferred route installs a `WH_CALLWNDPROC` hook in FM's visible UI thread,
then invokes the verified transfer routines there using temporary request,
offer, and filter objects. It submits no offers or UI commands. Native routines
can still touch FM's transient internal state, so this route is deliberately
limited to known routines and the verified executable build. If the hook cannot
be prepared or a native call fails, transfer values are reported unavailable;
the transfer request never starts an emulator. Own-player Playing Time queries
use the same in-process hook, with FM's native reason predicates and its
appearance-history routine.

## Batch performance

The UI sends up to 128 player IDs per request; the in-process bridge evaluates
them in one 128-player request on FM's UI thread. The worker stays warm and
caches the person index. A live 32-player native batch took 32 ms (about 990 players/sec).
The app's first 128-player request took 1.02 seconds including Node/worker startup
and person-index construction. Repeated requests through the same worker took
55–81 ms (about 1,580–2,320 players/sec). A warmed 310-player worker request
across three native messages took 162 ms (about 1,910 players/sec). The sampled
requests returned no row errors. Eight players matched the isolated reader for
value status/range and cash boundary, and one player's transfer and loan interest
also matched. These measurements are from one live save and are not a guarantee
for every save or machine.

The previous emulator-only 32-player run took 8.0 seconds for 29 valid players
(about 3.6 players/sec). That measurement is retained as a historical baseline;
the packaged worker no longer includes or loads the emulator.

## Supported build and evidence

Research used [REA](https://github.com/morluto/rea), its Rizin command bridge,
MSVC RTTI/vtables, PE exception-directory function boundaries, and assembly from
a read-only snapshot of the loaded executable. Initial string analysis skipped
large sections; that initial negative result was inconclusive.

The worker requires executable SHA-256
`33e8a2e48c4986f2a15e11c4c93aca1199029d66b19bd765403eb22dea265378`,
checks the routine prefixes and interest lookup table, confirms that the visible
FM window is on the game thread, and resolves RVAs against the live module base.
Unknown builds and failed individual queries leave fields unavailable. These
offsets must not be applied to another build blindly.

All addresses below are **RVAs** (the research image base was `0x140000000`).
The in-process path calls the valuation core at `0x21CA070` directly, using the
arguments and zeroed optional values supplied by the outer range builder; this
returns the same range/status observed in the isolated reader without entering
the outer routine's later UI-allocation path.

| Routine/data | RVA | Recovered use |
| --- | --- | --- |
| Buyer-specific price | `0x21953E0` | RCX player base, RDX buyer club, R8D -1, R9D 0, stack args 0, 0 |
| FM valuation range builder | `0x21B9560` | RCX player base, RDX manager base, R8 output, R9 0 |
| Valuation read point | `0x21B977B` | Before UI allocation: signed lower/upper at RBP+8/+12; -1 means unknown |
| Valuation range core | `0x21CA070` | RCX player, RDX manager, R8/R9 pointers to signed lower/upper outputs; remaining four arguments 0 |
| Full transfer-offer constructor | `0x49DAB60` | RCX emulator-local 0xD0-byte offer |
| AI offer-value evaluator | `0x39C4950` | RCX transfer manager, RDX offer, R8D 0, R9D -1 |
| Transfer interest filter | `0x48706B0` | PERSON_INTERESTED_FILTER_RULE |
| Loan interest filter | `0x486FE50` | Loan variant with the same filter context |
| Interest menu lookup | `0x29C71D0` | Maps menu index to native threshold |
| Interest threshold table | `0x6324328` | Seven signed int32 values, including hidden All |

The stored guide value is **player base + `0x1D0`**. The former `+0x1B0`
read unrelated packed data, including values such as 3 for contracted players.
`0xFFFFFFFF` means unset. 300,000,000 can be a legitimate capped guide value;
it is not universally an unknown marker. The guide is not the UI valuation range.

## Cash boundary verification

The offer's person, buyer team, seller team and cash fields are at +0x30, +0x38,
+0x48 and +0x50. Installments, exchanges and add-ons are absent. Returning true
from the evaluator alone does **not** mean acceptance: counteroffers return true
too. A quote is published only if the calculated amount returns unchanged with no
extras and an amount one pound lower does not. At RVA `0x39C4E27`, the evaluator
compares the demanded value with the offered value; its `jle` acceptance branch
targets `0x39C530E`.

Read-only runs from the current Lions Gibraltar save, in internal GBP:

| Player | Unchanged cash amount | One pound below produced | FM valuation range |
| --- | ---: | ---: | --- |
| Raphael Sallinger (210609) | 397,798 | counter 397,799 | Unknown |
| Michel Vlap (215665) | 3,431,172 | counter 3,431,173 | 2,299,020–4,965,883 |
| Mark Shelton (215501) | 7,433 | counter 7,434 | 7,488–24,460 |
| Erling Haaland (29179241) | 278,285,280 | counter 278,285,281 | 278,285,280–303,330,956 |

These are native evaluator observations, not transfers submitted to FM or a
guarantee that every other AI transfer policy will approve an offer.

## Interest filter

Rule +0x38 must be 1. The rule contains a single `flvl` integer property; the
row context +8 points to the player PERSON. Search context +8 is manager base,
+0x18 buyer team, and +0x20 manager PERSON. The native routine handles manager
ability adjustment, salary, reputation, nationality and availability itself.

| FM menu level | Native threshold |
| --- | ---: |
| Doubtful | -10000 |
| Unsure | -2000 |
| Slightly Interested | 0 |
| Interested | 5000 |
| Very Interested | 10000 |
| Extremely Interested | 30000 |

The column reports the highest passing filter level; failing Doubtful is shown
as Not interested. The UI filter uses “at least” semantics. Shelton passes
Extremely Interested for the current manager; Haaland fails Doubtful. Some loan
queries reach an unsupported CRT instruction and remain unavailable independently
of the transfer result.

## Runtime and refresh

`reader/native_query/query.py` is called by `app/native-transfer.js` through a
serialized local API. Visible rows are queued first; sorting or filtering on
these fields queues all players matching the other criteria. Read progress is
shown, and unqueried rows are excluded from exact filters until evaluated.
Large unfiltered databases take time; narrow ordinary filters first. The pause
button lets the current batch finish and stops further reads; Read FM data for
results resumes them.

Use **New data** after changing saves, manager context or advancing the game to
clear query results. Queries require the current club to match the loaded dump.
Multiple active human managers fail closed until buyer selection is implemented.
The game is not paused by the worker: query while FM is idle for a stable view.

Build the standalone worker with `reader/native_query/build.ps1`; it bundles
Python and PyInstaller, with no emulator engine. Development can run the Python
source with `pip install -r reader/native_query/requirements.txt` instead. No
captured game executable or game instructions are shipped.

### Manual FM transfer reads

FM transfer reads start paused after every data load. Use **Read FM data for results** to read a snapshot of the current results (including players awaiting the active FM filters), or select rows with click/Ctrl/Shift and use **Read FM data for selected rows**. Scrolling, filtering and sorting do not start additional reads. The reader pauses again when the requested queue finishes. Pause discards waiting rows; an active batch can still finish.

**FM value (before)** retains the verified stored guide value from the initial data load. **FM value (after)** shows the live manager-specific valuation range only after a successful live valuation. These are different FM valuation sources, so a difference does not necessarily mean the player's value changed over time.

Transfer queries skip playing-time happiness work and use binary search over the ordered interest thresholds (at most four checks per transfer/loan mode). Playing Time queries run the recovered concern-selection and appearance-history routines on FM's UI thread. The packaged worker uses a shared `_native-runtime` directory instead of extracting itself for every batch; keep that directory beside the worker executable.


### Warm transfer worker and unhappy XI

Manual transfer reads send bounded groups of 128 so the first results appear after one batch. The server keeps the worker alive for 60 seconds after its last request. Each batch opens fresh game memory, validates code signatures and manager/club, and reuses the executable digest (keyed by file metadata) and player-address index (keyed by process/base/database vector, with requested IDs revalidated). The hook runs each requested FM calculation on the game thread; no transfer or happiness results are cached between batches.

Playing-time happiness scores and native statuses are read only for the active manager's club. The table column is available only in My Players. Best XI has two radio options: the existing meta/PA-meta comparison, and Unhappy playing time. The latter uses the same formation, team-group/proficiency filters and unique-player assignment, ranking lower raw happiness scores first. Unknown happiness cannot displace known scores; remaining players are listed by eligible position with unknowns last.
