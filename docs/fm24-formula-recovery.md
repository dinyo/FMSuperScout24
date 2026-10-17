# FM24 interest and minimum-bid formula recovery

Status: **partial recovery; a complete standalone formula is not verified**.
Research date: 17 October 2026. The standalone helper remains research-only; production
queries call verified FM routines directly.

## Evidence and tools

REA 6.5.0's `execute-rizin-command` bridge produced new instruction evidence
from the existing read-only FM module capture. Targeted Ghidra 12.1.4
decompilation then reconstructed the entry routines and their dependencies.
Ghidra and its JDK were downloaded into ignored research storage, with archive
checksums verified. The [Ghidra release](https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_12.1.4_build)
publishes the Ghidra archive checksum.

Supported FM executable SHA-256:
`33e8a2e48c4986f2a15e11c4c93aca1199029d66b19bd765403eb22dea265378`.
Offline capture SHA-256:
`e8859797cf0dc4830fda7ecbfe921e9a4b04699769e17b136c9f4555e2018256`.

The targeted analysis view preserves the capture's instruction/data bytes from
RVA `0x1000` through `0x6628FFF`. Its PE headers omit unrelated sections and
loader directories to avoid importing unrelated libraries. The original capture
is unchanged. The view is an analysis artifact, not a runnable FM executable.
Function bodies use the captured PE unwind bounds. Those bounds alone do not
prove that every byte is an instruction or that all jump-table paths were found.

## Recovered threshold arithmetic

The filter uses **manager current ability**, not merely reputation or a player's
CA. Manager staff CA is a signed 16-bit read at staff base + `0xD6`. This field
matches the reader's existing `StaffCaOffset`.

```js
const menuThresholds = [-10000, -2000, 0, 5000, 10000, 30000];
const adjusted = menuThresholds[level - 1] + 20 * (200 - managerCA);
const transferThreshold = adjusted;
const loanThreshold = Math.trunc(adjusted / 2);
```

Transfer instructions: RVAs `0x4870989..0x487099B`.
Loan instructions: RVAs `0x487006C..0x4870088`.
These are thresholds supplied to deeper calculations, **not the player's
interest score or the complete Interested In filter**.

The research translation is
[`tools/fm-formulas/interest-threshold.js`](../tools/fm-formulas/interest-threshold.js).
It rejects unknown inputs and is not wired into the viewer.

In the running save, manager CA was 163. Sandbox register observations matched
all twelve intermediate values:

| Level | Transfer threshold | Loan threshold |
| --- | ---: | ---: |
| Doubtful | -9260 | -4630 |
| Unsure | -1260 | -630 |
| Slightly Interested | 740 | 370 |
| Interested | 5740 | 2870 |
| Very Interested | 10740 | 5370 |
| Extremely Interested | 30740 | 15370 |

The observations stopped at RVA `0x48709D6` for transfer and `0x48700CD` for loan,
before the deeper call. No writes reached the game.

## Recovered dependency structure

| Component | RVA | Finding |
| --- | --- | --- |
| Transfer filter | `0x48706B0` | Availability, context, manager-CA threshold, level gate and final restriction checks |
| Loan filter | `0x486FE50` | Separate eligibility, score, money comparison and policy checks |
| Interest level gate | `0x21C7A40` | Multiple score calls with different context/playing-time arguments; reports a separate pass flag |
| Interest score dispatcher | `0x4B41C90` | Returns sentinel scores for some cases; dispatches by mode, contract and existing club |
| Contracted-player transfer branch | `0x4B436D0` | Early refusal/acceptance branches, then many ordered score adjustments |
| Loan money routine | `0x4B3EB20` | Additional inputs beyond the interest score |
| Buyer-specific price | `0x21953E0` | 8,762-byte routine with many calls and conditional paths |
| Cash offer evaluator | `0x39C4950` | 10,284-byte routine; acceptance/counterproposal is separate from buyer-price calculation |

The live service pointer at RVA `0x642DD60` resolves through its vtable slot
`0xF8` to score dispatcher `0x4B41C90`, and slot `0xC8` to `0x4B3EB20` in the
verified build. These targets were read from the running game rather than
guessed from static call syntax.

The loan filter also requires its returned money quantity to be at most
2,999,999 internal units and at most `0.2 * referenceAmount` before later policy
checks. The reference amount is returned by RVA `0x21A5F80`. This arithmetic is
visible in the instructions; the full semantic contract of those quantities is
not yet established, so this is not exposed as a UI affordability formula.

### Native score contribution observations

The score dispatcher accepts an optional explanation accumulator. A research
hook intercepted its reason/amount writer at RVA `0x26C1DA0`, recorded the terms
and returned within emulator memory. No game code was patched. Calls with this
hook were compared with fresh uninstrumented calls using the same arguments.

For player 215501, dispatcher mode 4 and explicit playing-time argument 7:

| Native reason ID | Contribution |
| --- | ---: |
| 1 | 56576 |
| 3 | 7200 |
| 2 | 3126 |
| 4 | -5368 |
| 54 | 2300 |
| **Sum / native returned score** | **63834** |

The same technique reproduced raw scores -53387 (mode 4) and -2382 (mode 3) for
player 210609. In these three non-sentinel cases, logged contributions summed
to the returned score and the uninstrumented score matched. The mode-3
calculation for player 215501 hit the unsupported runtime instruction and is
incomplete.
Native reason IDs are retained without guessing their semantic names. These
observations expose individual terms for further recovery; their inputs and
formulas must still be translated. They are not complete UI-interest results.

I also traced real `interest_passes` calls and captured the arguments at the
score-dispatcher entry. The trace supplied a local explanation accumulator in
the emulator copy; the transfer and loan filter results matched uninstrumented
baseline calls for every traced case. In the positive transfer case (player
215501), FM passed mode 4 and playing-time context 8. The returned score was
67,953, with terms 56,576 + 7,200 + 3,126 - 1,249 + 2,300. The filter passed
even at level 6. Player 210609's transfer call passed mode 4 and context 9,
returned -53,387, and failed at levels 1 and 6. The tested loan path for that
player called the dispatcher three times: mode 3 returned -2,382; two mode-4
comparison calls returned 220 each; the loan filter failed. These values
confirm that the UI filter supplies candidate-specific context and that a loan
query can use several score calls. They do not establish that all loan branches
use this same call pattern.

The observed explanation terms map to helpers by their actual writer/tail-call
sites:

| Reason ID | Helper RVA | Evidence |
| ---: | --- | --- |
| 1 | `0x4B47B40` | Candidate, buyer and seller inputs; conditional score changes |
| 2 | `0x4B4A360` | Multiple club reputation and context branches |
| 3 | `0x4B49B30` | Buyer/seller club and competition comparisons |
| 4 | `0x4B4AA30` | Context-dependent adjustment; can tail-call the reason writer |
| 36 | `0x4B4D880` | Reason writer observed in a conditional helper branch |
| 54 | `0x4B4B770` | Squad and roster state checks |
| 58 | `0x4B4D2E0` | Reason writer observed in a conditional helper branch |
| 99 | `0x4B4D6A0` | Reason writer observed in a conditional helper branch |
| 117, 121, 122, 124 | `0x4B4F060` | Several category adjustments emitted by the same helper |
| 137 | `0x4B4DF20` | Reason writer observed in a conditional helper branch |
| 141 | `0x4B502A0` | Reason writer observed in a conditional helper branch |

These are source locations, not human-readable reason names. The decompiler
does not establish all helper inputs or semantic names, and other players
produce different reason sets. In particular, reason 4's contribution changes
when the score's playing-time context changes, while the other observed terms
in that sample stay fixed.

Accumulator hooks then measured each helper's before/after score value for 14
players at contexts 8 and 9. Across 28 calls, 26 ordinary scores matched the
sum of all logged reason terms; the other two returned the `-100000` refusal
sentinel. The trace saw 14 distinct reason IDs and attributed each to its
writer helper. For player 215501 at context 8, the accumulator followed
`0 → 56,576 → 63,776 → 66,902 → 65,653 → 67,953`, matching reasons 1, 3, 2,
4 and 54 in order. Player 210609 at context 8 followed
`0 → 5,848 → -17,352 → -57,273 → -54,973 → -53,387`, matching reasons 1, 3,
2, 54 and 121. This proves the additive behavior for these ordinary calls;
the helper predicates and all input fields are still not translated.

A dense emulator sweep varied only the score dispatcher's playing-time context
from 0 through 20 for players 215501 and 210609. For every ordinary returned
score in that sweep, the recorded terms summed exactly to the score. Refusal
branches returned the `-100000` sentinel instead; a helper could log `-100001`
or other partial terms before that early return, so those logs are not an
additive explanation of the sentinel.

For player 215501, reason IDs 1, 2 and 3 stayed at 56,576, 3,126 and 7,200
across contexts 0 and 2–20. Reason 4 changed with context, was omitted at
context 9 when zero, and reason 54 (+2,300) appeared from context 7 onward.
The resulting ordinary score ranged from 54,177 at contexts 2–6 to 107,522
at context 20. For player 210609, contexts 7–15 returned the same score
(-53,387); reason 4 appeared at context 16 (+521) and then changed by 6,346
per context through context 20. This confirms piecewise/context-sensitive
behavior, but does not identify the native context values as human-readable
playing-time labels.

The contracted-player transfer branch at `0x4B436D0` invokes an ordered chain
of early gates and score-adjustment helpers. In the traced case, the observed
nonzero terms came from five helpers, while the branch contains many more
conditional helpers. Their ordered decompiled call chain is useful for
continued recovery, but it is not itself a verified JavaScript formula.

The verified minimum-bid pipeline remains:

1. Calculate a buyer-specific candidate price.
2. Evaluate a cash-only offer at that price.
3. Confirm FM returned the same cash amount without exchanges or add-ons.
4. Evaluate one unit less and confirm it is not accepted unchanged.

A buyer-price formula alone would not reproduce the verified minimum-bid field.
On the current save, the candidate passed the unchanged-cash check for all
three sampled players. The next lower offer was also accepted as a negotiation
response, but FM changed its cash amount to the candidate plus one internal
unit, so it failed the unchanged-cash check. This confirms why the evaluator's
returned acceptance flag alone cannot establish the boundary.

| Player ID | Candidate accepted unchanged | One unit lower: evaluator cash |
| ---: | ---: | ---: |
| 210609 | 397,798 | 397,799 |
| 215665 | 3,431,172 | 3,431,173 |
| 29179241 | 278,285,280 | 278,285,281 |

An emulator memory-read trace during the buyer-price call also shows why the
input schema is still open. Across those three candidates, the routine read
31–49 distinct offset/size pairs inside the player block, 17–20 in the seller
club block, 8 in the buyer club block, and 4 in the manager-team block. The
player and embedded-person ranges overlap, and the function follows pointers
into further objects, so these counts are bounded root observations rather
than a complete input list. The addresses have not all been assigned field
names. This trace narrows the work to a broad set of player, club, contract and
linked-object values; it does not reduce the price calculation to one or two
scalars.

Single-field perturbations in the emulator copy show branch thresholds. For
player 210609, changing CA from 107 to 102 left the candidate at 397,798, while
107 to 112 changed it to 437,577. For player 215665, CA 116 to 111 changed the
candidate from 3,431,172 to 1,258,096, and 116 to 121 changed it to 13,381,570.
Changing PA, world reputation, or the stored guide-value field alone did not
change these three candidates in the sampled deltas. Haaland's candidate also
stayed fixed when CA or PA changed by five points in the copy. These controlled
results are branch evidence, not a general coefficient rule; the other club
and contract inputs stayed at their save values.

An additional stage trace followed the candidate price through its native
helpers while changing CA only in the emulator copy. For player 210609, helper
`0x21ABBE0` selected category 6 at CA 99 and changed 397,798 to 218,788;
category 7/8 at CA 100/107 left 397,798 unchanged; category 9 at CA 108
changed it to 437,577; and category 10 at CA 119 changed it to 477,357. For
player 215665, helper `0x21AB620` tripled the pre-category amount from
2,287,448 to 6,862,344 at CA 119 and 124. At CA 124, `0x21ABBE0` then changed
that to 7,548,578, `0x21ACE00` changed it to 9,813,151, and `0x21AD890`
changed it to the final 14,719,726. The last helper applied a 1.5 multiplier
in this sample. These are verified stage outputs for these save contexts;
each helper has other conditional inputs, so these factors are not universal
rules.

### Direct root reads in the major score helpers

Unicorn memory-read traces limited to the three largest contributors—reason 1
(`0x4B47B40`), reason 3 (`0x4B49B30`) and reason 2 (`0x4B4A360`)—ran for three
players at contexts 8 and 9. Ordinary scores matched the existing dispatcher
traces. Reason 1 read 7–8 distinct slots in the candidate player block,
reason 3 read 3, and reason 2 read 3–4. For player 215501, the direct player
slots were:

| Helper / reason | Player-block offset/size pairs | Seller team + club slots | Buyer team + club slots |
| --- | --- | --- | --- |
| `0x4B47B40` / 1 | `0x0/8`, `0x8/8`, `0x110/8`, `0x1FC/2`, `0x1FE/2`, `0x278/8`, `0x290/1`, `0x340/8` | 10 total | 13 total |
| `0x4B49B30` / 3 | `0x0/8`, `0x8/8`, `0x340/8` | 5 total | 5 total |
| `0x4B4A360` / 2 | `0x8/8`, `0x1FE/2`, `0x340/8` | 3 total | 3 total |

The trace records access sizes, bytes and instruction RVAs for each sample.
These root counts exclude indirect objects and getters invoked by the helpers;
the offsets are not assigned field meanings, and their dependencies have not
been validated across saves. Player 215665 returned the `-100000` refusal
sentinel before reasons 2 and 3 ran, so their empty traces for that player do
not mean those helpers have no inputs.

## Coverage and remaining obligations

An initial nine-entry, one-call-level pass identified 142 candidate routines.
Expanding the interest helper region and its immediate calls increased this to
289. Linear static scans are dependency candidates, not proven execution paths.

Live sandbox block traces ran minimum-bid, transfer-interest and loan-interest
queries for player IDs 210609, 215665 and 29179241. All nine queries completed.
Together they visited 362 unwind-bounded functions and resolved 652 distinct
indirect site/target pairs in those samples. These include shared helpers, not
362 independent business formulas. Adding those observed routines to the static
selection produces 481 routines for targeted decompilation.

Of those 481 routines, 478 produced C pseudocode. The remaining three timed out
with both 20-second and 60-second per-function limits: RVAs `0x25624C0`,
`0x49EB090` and `0x2110560`. Generated files for these routines explicitly record
failure. Of the generated files, 327 contain decompiler warnings. These counts
describe extraction coverage, not formula correctness or branch coverage.
REA/Rizin nevertheless exported decoded instructions for the full declared byte
ranges of all three timed-out routines. Missing high-level pseudocode is distinct
from missing instruction evidence.

Follow-up Ghidra passes successfully decompiled 970 additional bounded direct
callees. A text-derived candidate graph from the eight interest and bid entry
points now reaches 2,042 routines: 1,346 have successful decompilations in the
research set and 696 still lack one. Of those 696, 246 have an unwind-range
boundary in the capture and 450 do not map to one. The graph follows direct
references in decompiler output; it does not prove every branch is reachable or
resolve virtual dispatch. The earlier dynamic trace separately observed 652
indirect call site/target pairs. These counts describe extraction coverage,
not formula correctness or branch coverage.

An additional transfer-interest trace for player ID 215501 returned
`Extremely Interested`, providing a positive case beyond the three initially
uninterested players. His loan-interest trace failed at an unsupported runtime
instruction outside the FM module. That failure is retained in
`formulas/dynamic-edge-cases.json`; it is not treated as `Not interested`.

This still does not prove completeness:

- Calls on unexecuted branches and virtual methods for other object types remain
  unresolved. The samples all come from one save and cannot cover them all.
- Decompiler output contains inferred types, warnings and unknown call contracts.
  A successful decompilation is not proof of a correct compilable replacement.
- The complete input snapshot is not mapped: contracts, buyer/seller club and
  team objects, manager context, date/state flags, relationships and rule tables
  remain interconnected memory structures.
- Signed integer behavior, float32 operations, truncation, sentinels and clamps
  need explicit translations and tests for each recovered branch.
- End-to-end JS parity across players, loans, free agents, contract states,
  manager contexts and saves has not been established.

Next work is to translate the predicates and memory inputs of the 37 score
accumulator helpers below `0x4B436D0`, resolve remaining indirect and virtual
branches, then compare stage-by-stage JS outputs with sandbox observations.
Minimum-bid recovery also needs the independent offer-evaluation path. Keep
native results as the reference until both are validated; the threshold
translation must not be presented as exact interest.

## Local research artifacts

All game captures, generated C, projects and research runtimes remain ignored
under `scratchpad/rea-fm24`; none are included in the app or installer.

- `formula-entry-complete.json`: REA/Rizin entry and availability evidence.
- `formula-interest-score.json`: REA/Rizin score-dispatcher evidence.
- `formula-unresolved-helper-instructions.json`: successful REA/Rizin instruction
  export for the three decompiler timeouts, with full-range checks in
  `formulas/unresolved-helper-instruction-coverage.json`.
- `formulas/analysis-view.json`: derivative view provenance and byte range.
- `formulas/decompiled/`: generated C pseudocode, including `transfer_filter.c`,
  `loan_filter.c`, `interest_score.c`, `buyer_price.c`, and `offer_evaluator.c`.
- `formulas/observed-dependency-manifest.json`: selected routine inventory.
- `formulas/decompiled-closure/`: additional bounded direct-callee pseudocode.
- `formulas/call-closure-audit.json` and
  `scratchpad/rea-fm24/audit_formula_call_closure.py`: reproducible candidate
  direct-call closure counts from the entry points.
- `formulas/dynamic-call-evidence.json`: nine queries and observed call edges.
- `formulas/dynamic-edge-cases.json`: the passing transfer-interest case and
  unsupported loan case.
- `formulas/threshold-live-verification.json`: twelve native register comparisons.
- `formulas/score-contributions.json`: explanation terms and comparison with
  uninstrumented native raw-score calls.
- `formulas/filter-helperargs-transfer.json` and
  `formulas/filter-helperargs-loan.json`: real filter calls, captured score
  arguments, helper inputs and explanation terms.
- `formulas/score-adjustment-chain.json`: per-helper accumulator changes and
  reason-writer attribution for 28 player/context calls.
- `formulas/minimum-bid-boundary-live.json`: current-save candidate and
  one-unit-lower offer outcomes for three players.
- `formulas/minimum-bid-read-roots.json`: memory-read offsets observed in
  bounded player, club and manager-team ranges during buyer-price calls.
- `formulas/minimum-bid-player-field-sensitivity.json`: single-field CA, PA,
  world-reputation and stored-value perturbations in the emulator copy.
- `formulas/minimum-bid-ca-curves.json` and
  `formulas/buyer-price-stage-traces.json`: CA boundary sweeps and intermediate
  buyer-price values in the emulator copy.
- `formulas/score-playing-time-sweep.json`: direct score-dispatcher context
  sweep with individual reason terms.
- `formulas/score-helper-player-reads.json`: targeted root-object reads by
  score helpers `0x4B47B40`, `0x4B49B30` and `0x4B4A360`, for three players at
  contexts 8 and 9.
- `formulas/interest-candidate-sample.json`: read-only candidate sample and
  sandbox score outputs used to broaden helper coverage.
- `DecompileFmFormulas.java`, `trace_formulas.py`,
  `trace_interest_details.py`, `trace_formula_runtime.py`, and
  `verify_thresholds.py`: local research scripts. `explain_formula_score.py`,
  `explain_formula_callers.py`, `trace_filter_scores.py`, and
  `trace_minimum_bid_reads.py`, `trace_minimum_bid_sensitivity.py`,
  `trace_buyer_price_stages.py`, `trace_playtime_sweep.py`,
  `trace_score_adjustment_chain.py`, `trace_score_helper_player_reads.py`, and
  `scan_interest_candidates.py` capture score contributions, call context,
  field reads, and price-stage evidence.

Validation: `node --test test/fm-formula-threshold.test.js` passes both tests,
including comparisons against all twelve captured native values.
