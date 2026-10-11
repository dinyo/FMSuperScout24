# Meta weight calibration

`app/meta-presets/default_gk_mod.json` contains the active GK-multiplier preset weights. Its GK weights are scaled by 1.8 to bring the all-20 GK score closer to the all-20 outfield score. `app/meta-presets/default_original.json` preserves the earlier GK weights and is loaded by **Reset to default**. **Reset to default (GK multiplier)** loads `default_gk_mod.json`. **Reset to new method** loads `app/meta-presets/default_new_method.json`.

The original GK weights were recovered from the tracked `default_gk_mod.json` before its GK values were scaled. They are preserved in the original preset file and in the table below.

| Goalkeeper attribute | Original measured weight | Active weight (1.8x) |
| --- | ---: | ---: |
| Reflexes | 8 | 14.4 |
| Agility | 6 | 10.8 |
| Acceleration | 2 | 3.6 |
| OneOnOnes | 0.3 | 0.54 |
| AerialReach | 0.1 | 0.18 |
| CommandOfArea | 0.1 | 0.18 |
| Communication | 0.1 | 0.18 |
| Handling | 0.1 | 0.18 |
| Anticipation | 0.1 | 0.18 |
| Concentration | 0.1 | 0.18 |
| Positioning | 0.1 | 0.18 |

The original values record the measured relative contributions. The 1.8 multiplier is a score-scale calibration so that perfect-attribute players can be compared across goalkeeper and outfield positions. If the calibration changes, derive the active GK weights by multiplying the original column by the new factor; keep this baseline unchanged.

## New method

The new method is a normalized impact index. A player with every tested attribute at 20 and Natural (20) position proficiency scores 100 in each position group. That gives GK and outfield players the same ceiling without multiplying goalkeeper weights by 1.8. It does not claim that all real players in different roles have identical match impact.

### Outfield roles

The outfield vector is now an equal blend of two separately normalized studies, which is why it differs from the original app weights:

* Zippo tested one attribute from 8 to 20 and reported points over 38 matches. Jumping Reach was tested from 8 to 17, so its per-point impact is extended linearly to 20. The positive impacts total 308.333 test points before normalization.
* The FM-Arena table has a 60.0-point default-attributes result and all-position +5 attribute tests. For each tested attribute, the method uses the positive PTS change from 60, divided by 5. Negative changes are clipped to zero, so a noisy or tactic-specific decrease does not make a higher attribute harmful. The positive per-point signals total 19.06 before normalization.

Because one study uses 8-to-20 individual tests and the other uses all-position +5 tests, their raw point changes are not directly comparable. Each source is normalized to 100, then each contributes half of the new outfield weights. The FM-Arena test changes attributes across all positions, so the blended vector is shared by DC, FB, DM, MC, WM, AM, and ST; the sources do not support seven distinct role-specific vectors.

The changed proportions show what the second source adds:

| Attribute | Original outfield share | New blended share |
| --- | ---: | ---: |
| Pace | 20.76 | 21.13 |
| Acceleration | 20.76 | 21.08 |
| Jumping Reach | 6.92 | 9.55 |
| Dribbling | 6.16 | 8.22 |
| Anticipation | 5.84 | 5.17 |
| Stamina | 6.16 | 4.39 |
| Concentration | 2.92 | 3.82 |
| Work Rate | 3.89 | 2.52 |

### Goalkeepers

The two keeper studies report different outcomes and test ranges, so their raw values cannot be added to the outfield points or directly to each other. The new method normalizes each keeper study to its own positive-signal total, then gives the two distributions equal weight:

* From the FM-Arena 20-to-1 retest, it keeps attributes whose reported win-rate drop is at least 1 percentage point.
* From the Reddit 12-to-20 test, it subtracts the 2.34 goals-per-season spread between the two controls and keeps positive results above that noise floor.
* The Reddit test found Acceleration and Pace together at 16/16 reduced goals conceded by 10.41, versus a 6.87 linear estimate from the separate tests. The 3.54 residual is a separate bonus that requires both attributes to improve and caps at 16/16. It adds 2.056227 points to the normalized keeper index.

The resulting GK attribute weights sum to 97.943773; the speed-pair bonus brings the maximum to 100. GK effects are therefore based on keeper experiments rather than an upscaled copy of outfield weights. Morale, condition/sharpness, and team cohesion are not inputs. Individual Teamwork is also omitted because its keeper-test result fell within the control noise floor.

### Shared scoring rules and limits

Scores use baseline 8 and linearly scale tested attribute contributions to 20. The existing outfield proficiency result (6 points for Natural 20 versus Accomplished 15) is scaled against the 308.333-point outfield total and reused for GK because the cited keeper studies do not test proficiency. This is a shared scoring convention, not a GK-specific finding. Missing attributes are not reweighted; a complete player at all 20s is the one that reaches 100.

These studies differ in game edition, tactics, sample setup, test range, and outcome measure. The keeper blend is a documented model choice, not a direct conversion of win rate or goals conceded into outfield match points. More role-specific outfield tests or repeated GK tests could support a future recalibration.

Sources: [FM-Arena attribute table](https://fm-arena.com/table/26-player-attributes-testing/), [Zippo's attribute testing thread](https://fm-arena.com/thread/14009-attribute-testing-football-manager-24/), [FM-Arena goalkeeper retest](https://fm-arena.com/thread/18816-fm24-i-re-tested-the-goalkeeper-s-attributes-using-newer-test-league/), and [Reddit goalkeeper test](https://www.reddit.com/r/footballmanagergames/comments/1vo5202/fm_24_gk_attributes_test/).
