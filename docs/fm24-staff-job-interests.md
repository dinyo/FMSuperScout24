# FM24 staff job interests

Verified on the running FM24 save on 17 October 2026 using REA 6.5.0's
`execute-rizin-command`, a read-only module capture, and read-only process inspection.
Supported executable SHA-256:
`33e8a2e48c4986f2a15e11c4c93aca1199029d66b19bd765403eb22dea265378`.

## Root cause and layout

The byte at non-player base + `0xDA` is a cached job choice. It can be zero for
unemployed staff. It is not the list of job interests. Dylan Rousselle (UID
2002133023) has zero in that field, no current contract, and a valid preference
list with Head of Youth Development at 20.

Resolve the staff facet using the signed offset at `[nonPlayerBase + 8] + 8`:
`staffFacet = nonPlayerBase + 8 + offset`. For Dylan this is base + `0x120`.
Validate its reverse virtual-base link to the person before following pointers.
The pointer at `staffFacet + 0xD8` addresses **15 bytes**, each a preference from 0 to 20.
Do not confuse this with non-player base + `0xD8`, which is PA.

| Index | Interest group | Dylan's value |
| --- | --- | ---: |
| 0 | Head Coach | 11 |
| 1 | Assistant Coach | 13 |
| 2 | Coach | 15 |
| 3 | Physio | 8 |
| 4 | Scout | 10 |
| 5 | Goalkeeping Coach | 1 |
| 6 | Fitness Coach | 1 |
| 7 | Set Piece Coach | 1 |
| 8 | Chairman | 1 |
| 9 | Director of Football | 5 |
| 10 | Head of Youth Development | 20 |
| 11 | Loan Manager | 8 |
| 12 | Data Analysis (shared analytical roles) | 1 |
| 13 | Sports Scientist | 1 |
| 14 | Technical Director | 5 |

FM can show more role labels than preference bytes: analytical roles share a
preference group. Interest scores describe willingness to work in a role, not
coaching ability. The profile displays the raw groups and scores without
inventing separate scores for each analytical specialization.

## REA instruction evidence (RVAs)

- `0x21338D0`: `mov rax,[rcx-0x78]; ret` for a staff interface at facet + `0x150`;
  this resolves the preference pointer at facet + `0xD8`.
- `0x212D400`: allocates the 15-byte `JOB_PREFERENCES` record when needed. The
  reader only reads existing records and never calls this allocating routine.
- `0x2133790`: current/retained job paths, then cached non-player + `0xDA` when
  its supporting data exists, then fallback selection from the preference list.
- `0x437E410..0x437E5A7`: highest-preference selection with strict-greater
  comparisons. Default comparison order: Head Coach, Director of Football,
  Technical Director, Loan Manager, Head of Youth Development, Assistant Coach,
  Goalkeeping Coach, Fitness Coach, Set Piece Coach, Coach, Physio, Data Analysis,
  Sports Scientist, Scout, Chairman. Ties retain the earlier role; scores at or
  below 1 do not establish a preferred role.
- `0x25BDE30..0x25BDF49`: specializes the analytical choice. For the default
  selection path the native job is 60; a rounded JPA / Tactical Knowledge ratio
  of at least 1.2 selects 58. Contract-role IDs 58, 60 and 62 are Performance
  Analyst, Head Performance Analyst and Recruitment Analyst. Current contracts
  stay separate from preferences. The reader uses the default unrestricted
  preference selection, rather than league-specific job-availability restrictions.

The reader validates getter/selector instruction prefixes before reading this
layout and rejects missing pointers or out-of-range preferences. Existing dumps
must be refreshed; their missing preference data cannot be reconstructed from
staff coaching attributes.

## Checks

- A direct call to the rebuilt reader's actual `ReadStaff` method against Dylan's
  live person returned preferredJobId **64** and all 15 scores above.
- `dotnet run --project test/reader-jobs/reader-jobs.csproj` checks Dylan's fixture,
  each of the 15 preference indices, native tie order, analytical specialization,
  unset values and invalid reads without requiring a running game.
- `npm test` covers staff labels, filter keys, current/preferred separation and
  safe profile rendering of the preference list.
