using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace FMSuperScout.Reader;

internal sealed class Fm24Reader : IDisposable
{
    private const uint ProcessVmRead = 0x0010;
    private const uint ProcessQueryInformation = 0x0400;
    private const uint MemCommit = 0x1000;
    private const uint PageGuard = 0x100;
    private const uint PageNoAccess = 0x01;
    private const uint PageExecute = 0x10;
    private const uint PageExecuteRead = 0x20;
    private const uint PageExecuteReadWrite = 0x40;
    private const uint PageExecuteWriteCopy = 0x80;
    // FM24 24.4.x club records link to their Cint (facilities) and Cfin
    // (finances) blocks at these offsets. Values were checked against Genie Scout.
    private const ulong ClubInfoPointerOffset = 0x100;
    private const ulong ClubFinancePointerOffset = 0x150;
    private const int ClubTrainingFacilitiesOffset = 0x120;
    private const int ClubYouthFacilitiesOffset = 0x12B;
    private const int ClubJuniorCoachingOffset = 0x12C;
    private const int ClubYouthRecruitmentOffset = 0x12D;
    private const int ClubBalanceOffset = 0x14;
    private const int ClubRemainingTransferOffset = 0x7CC;
    private const int ClubTransferBudgetOffset = 0x7D0;
    private const int ClubWeeklyWageBudgetOffset = 0x810;
    private const int ClubWeeklyWageTotalWithBonusesOffset = 0x81C;
    // FM24.4.2 Cfin block signatures observed in the live club database.
    private static readonly HashSet<ushort> ClubFinanceMarkers = new() { 0x3BA8, 0x4048 };
    private const uint MaxPlausibleClubTransferBudget = 1_000_000_000;
    private const uint MaxPlausibleWeeklyWageBudget = 100_000_000;
    private const ulong ShortlistRowMarker = 0xFFFFFFFF00000000UL;
    private static readonly int[] ShortlistStrides =
        { 0x20, 0x28, 0x30, 0x38, 0x40, 0x48, 0x50, 0x58, 0x60, 0x70, 0x80 };
    // FM Genie Scout's FM24 proxy uses the same build-specific module pointer
    // to locate the active shortlist vector. These values are the FM24 build
    // signatures recovered from its FindShortlistOffset routine.
    private static readonly Dictionary<int, ulong> GenieShortlistSignatures = new()
    {
        [0x1D314D] = 0x5A674C8, [0x1D37D2] = 0x5A6B6F8, [0x1D37D3] = 0x5A744E8,
        [0x1D37D4] = 0x59F8A68, [0x1D4CF9] = 0x5A6B7C8, [0x1D559C] = 0x5A6C808,
        [0x1D559D] = 0x5A765F8, [0x1D5A54] = 0x59FAB78, [0x1D7001] = 0x5AA1158,
        [0x1D7002] = 0x5AAD268, [0x1D7003] = 0x5A317F8, [0x1D7EF4] = 0x5AA4178,
        [0x1D7EF5] = 0x5AB0288, [0x1D7EF6] = 0x5A317F8, [0x1D9703] = 0x5A33818,
        [0x1DDA12] = 0x5ABA948, [0x1DDA13] = 0x5ABED18, [0x1DDA14] = 0x5A43288,
        [0x1E071B] = 0x5ABC998, [0x1E071C] = 0x5AC1D68, [0x1E071D] = 0x5A452D8,
        [0x1F8140] = 0x5ABC9B8, [0x1F8141] = 0x5AC1D88, [0x1F8142] = 0x5A462F8,
        [0x1FC423] = 0x5ABC9B8,
    };

    private readonly int _pid;
    private readonly string _dataDir;
    private readonly IntPtr _handle;
    private readonly Process _process;
    private readonly ulong _moduleBase;
    private readonly ulong _moduleEnd;
    private DateTime? _gameDate;
    // FM24 24.4.x staff layout (nplo): CA and PA are adjacent u16 fields.
    private const int StaffCaOffset = 0xD6;
    private const int StaffPaOffset = 0xD8;
    private const int StaffAttrsOffset = 0x18;

    private static readonly (string key, int offset)[] Attrs =
    {
        ("Crossing", 0x00), ("Dribbling", 0x01), ("Finishing", 0x02), ("Heading", 0x03),
        ("LongShots", 0x04), ("Marking", 0x05), ("OffTheBall", 0x06), ("Passing", 0x07),
        ("PenaltyTaking", 0x08), ("Tackling", 0x09), ("Vision", 0x0A), ("Handling", 0x0B),
        ("AerialReach", 0x0C), ("CommandOfArea", 0x0D), ("Communication", 0x0E), ("Kicking", 0x0F),
        ("Throwing", 0x10), ("Anticipation", 0x11), ("Decisions", 0x12), ("OneOnOnes", 0x13),
        ("Positioning", 0x14), ("Reflexes", 0x15), ("FirstTouch", 0x16), ("Technique", 0x17),
        ("Flair", 0x1A), ("Corners", 0x1B), ("Teamwork", 0x1C), ("WorkRate", 0x1D),
        ("LongThrows", 0x1E), ("Eccentricity", 0x1F), ("RushingOut", 0x20), ("Punching", 0x21),
        ("Acceleration", 0x22), ("FreeKicks", 0x23), ("Strength", 0x24), ("Stamina", 0x25),
        ("Pace", 0x26), ("JumpingReach", 0x27), ("Leadership", 0x28), ("Balance", 0x2A),
        ("LeftFoot", 0x18), ("RightFoot", 0x19),
        ("Bravery", 0x2B), ("Aggression", 0x2D), ("Agility", 0x2E), ("NaturalFitness", 0x32),
        ("Determination", 0x33), ("Composure", 0x34), ("Concentration", 0x35),
        ("Dirtiness", 0x29), ("Consistency", 0x2C), ("ImportantMatches", 0x2F),
        ("InjuryProneness", 0x30), ("Versatility", 0x31),
    };
    private static readonly (string key, int offset)[] Positions =
    {
        ("GK", 0), ("SW", 1), ("DL", 2), ("DC", 3), ("DR", 4), ("DM", 5),
        ("ML", 6), ("MC", 7), ("MR", 8), ("AML", 9), ("AMC", 10), ("AMR", 11),
        ("ST", 12), ("WBL", 13), ("WBR", 14),
    };

    public Fm24Reader(int pid, string dataDir)
    {
        _pid = pid;
        _dataDir = dataDir;
        _process = Process.GetProcessById(pid);
        if (_process.HasExited) throw new InvalidOperationException("FM24 is al afgesloten.");
        _handle = OpenProcess(ProcessVmRead | ProcessQueryInformation, false, pid);
        if (_handle == IntPtr.Zero) throw new InvalidOperationException("Kan fm.exe niet openen voor lezen (start de tool opnieuw als dezelfde Windows-gebruiker).");
        try
        {
            var module = _process.MainModule ?? throw new InvalidOperationException("fm.exe module niet gevonden.");
            _moduleBase = (ulong)module.BaseAddress.ToInt64();
            _moduleEnd = _moduleBase + (ulong)module.ModuleMemorySize;
        }
        catch { CloseHandle(_handle); throw; }
    }

    public Dump Scan()
    {
        WriteStatus("scanning", 0, 0, 0.02, null);
        _gameDate = FindGameDate();
        var table = FindPersonTable();
        var offsets = DiscoverOffsets(table);
        if (!offsets.Contains(0x278) && !offsets.Contains(0x138))
            throw new InvalidOperationException($"FM24 person database gevonden, maar geen bekende player-vtable-offset (gevonden: {string.Join(", ", offsets.Select(x => $"0x{x:X}"))}).");

        var clubs = ReadClubCatalog(table.DatabaseRoot, out var teamTypeCounts, out var competitionTypeCounts);
        var humanManager = FindHumanManager(clubs);

        var players = new List<Person>();
        var staff = new List<Person>();
        var playerRowsByAddress = new Dictionary<ulong, Person>();
        // A player/coach can expose the same UID through both the staff facet and
        // the player/staff facet. Keep player and staff de-duplication separate so
        // the player row is not lost merely because FM listed the staff object first.
        var seen = new HashSet<uint>();
        var seenPlayers = new HashSet<uint>();
        var typeCounts = new Dictionary<int, int>();
        var staffLayoutProfiles = new Dictionary<int, int[]>();
        var staffLayoutSamples = new List<string>();
        var staffContractRoleBytes = new Dictionary<int, Dictionary<int, int>>();
        var staffContractJobIds = new Dictionary<int, int>();
        int total = table.Pointers.Count;
        for (int i = 0; i < total; i++)
        {
            ulong person = table.Pointers[i];
            if (person == 0) continue;
            uint uid = ReadU32(person + 0x0C);
            if (uid == 0) continue;
            int offset = ReadTypeOffset(person);
            bool playerFacet = offset is 0x278 or 0x138 or 0x368;
            // 0x368 is FM24's player/staff layout. It may share a UID with a
            // preceding 0xF8 staff facet, so allow it through the general UID gate;
            // seenPlayers below still prevents duplicate player rows.
            if (playerFacet)
            {
                if (!seenPlayers.Add(uid)) continue;
                seen.Add(uid);
            }
            else if (!seen.Add(uid)) continue;
            typeCounts[offset] = typeCounts.GetValueOrDefault(offset) + 1;
            if (offset is 0xF8 or 0x368 or 0x450)
            {
                if (!staffLayoutProfiles.TryGetValue(offset, out var profile)) staffLayoutProfiles[offset] = profile = new int[4];
                profile[0]++;
                ulong staffBase = person - (ulong)offset;
                ushort ca = ReadU16(staffBase + StaffCaOffset), pa = ReadU16(staffBase + StaffPaOffset);
                if (ca is >= 1 and <= 200 && pa is >= 1 and <= 200 && pa >= ca - 30) profile[1]++;
                int attrsFound = StaffAttrs.Count(x => ReadByte(staffBase + StaffAttrsOffset + (ulong)x.offset) is >= 1 and <= 100);
                if (attrsFound >= 18) profile[2]++;
                ulong contract = ReadPtr(person + 0xC8);
                if (contract != 0 && JobNames.ContainsKey(ReadByte(contract + 0x1C))) profile[3]++;
                if (contract != 0)
                {
                    int jobId = ReadByte(contract + 0x1C);
                    staffContractJobIds[jobId] = staffContractJobIds.GetValueOrDefault(jobId) + 1;
                }
                if (offset == 0xF8 && contract != 0)
                {
                    byte[]? contractData = ReadBytes(contract, 0x80);
                    if (contractData != null)
                        for (int field = 0; field < contractData.Length; field++)
                        {
                            int value = contractData[field];
                            if (!JobNames.ContainsKey(value)) continue;
                            if (!staffContractRoleBytes.TryGetValue(field, out var values)) staffContractRoleBytes[field] = values = new();
                            values[value] = values.GetValueOrDefault(value) + 1;
                        }
                }
                if (staffLayoutSamples.Count < 12 && (offset != 0xF8 || profile[0] <= 4))
                    staffLayoutSamples.Add($"0x{offset:X} {ReadPersonName(person)} uid={uid} CA/PA={ca}/{pa} attrHits={attrsFound}/23 jobByte={(contract == 0 ? -1 : ReadByte(contract + 0x1C))}");
            }
            try
            {
                if (playerFacet)
                {
                    var p = ReadPlayer(person, uid, offset);
                    if (p != null)
                    {
                        players.Add(p);
                        playerRowsByAddress[person] = p;
                        playerRowsByAddress.TryAdd(person - (ulong)offset, p); // plao base pointer stored by some FM24 squad records
                    }
                }
                else if (offset == 0xF8 || (humanManager != null && offset == humanManager.PersonOffset))
                {
                    var s = ReadStaff(person, uid, offset);
                    if (s != null) staff.Add(s);
                }
            }
            catch { /* één verdwenen object mag de dump niet breken */ }
            if ((i & 0x1FFF) == 0) WriteStatus("scanning", players.Count, staff.Count, 0.05 + 0.9 * i / Math.Max(1.0, total), null);
        }

        // Some 24.4.x saves expose player+staff hybrids (0x368) through the
        // staff facet first. Revisit only those hybrids after the main pass so a
        // valid Scouting player cannot disappear because an earlier facet used
        // the same UID or was read while FM was refreshing the object.
        var playerIds = players.Select(x => x.id).ToHashSet();
        foreach (ulong person in table.Pointers)
        {
            uint uid = ReadU32(person + 0x0C);
            if (uid == 0 || playerIds.Contains(uid) || ReadTypeOffset(person) != 0x368) continue;
            try
            {
                var hybrid = ReadPlayer(person, uid, 0x368);
                if (hybrid != null)
                {
                    players.Add(hybrid); playerIds.Add(uid);
                    playerRowsByAddress[person] = hybrid;
                    playerRowsByAddress.TryAdd(person - 0x368UL, hybrid);
                }
            }
            catch { }
        }

        if (humanManager != null)
        {
            var managerRow = staff.FirstOrDefault(s => s.id == humanManager.Id);
            if (managerRow == null)
            {
                managerRow = ReadStaff(humanManager.Person, humanManager.Id, humanManager.PersonOffset);
                if (managerRow != null) staff.Add(managerRow);
            }
            if (managerRow != null) { managerRow.jobId = 16; managerRow.job = "Manager"; }
        }

        if (players.Count == 0)
            throw new InvalidOperationException($"FM24 person database bevatte geen leesbare spelers (objecten: {table.Pointers.Count:N0}, offsets: {string.Join(", ", offsets.Select(x => $"0x{x:X}"))}).");

        var squadStats = ApplySquadMembership(clubs, playerRowsByAddress);

        DateTime date = _gameDate ?? DateTime.Now;
        foreach (var p in players.Concat(staff))
        {
            if (p.birthYear > 0 && p.birthDoy > 0)
                p.age = AgeAt(p.birthYear, p.birthDoy, date);
        }
        string gameVersion = "FM24 native memory";
        try { gameVersion = _process.MainModule?.FileVersionInfo.FileVersion ?? gameVersion; } catch { }
        var dump = new Dump { meta = new DumpMeta {
            generated = DateTime.Now.ToString("s"), gameDate = date.ToString("yyyy-MM-dd"),
            gameDateSource = _gameDate.HasValue ? "memory" : "derived", gameYear = date.Year,
            gameVersion = gameVersion, manager = humanManager?.Name ?? "",
            myClub = humanManager?.Club ?? "", myClubId = humanManager?.ClubId ?? 0, myClubRep = humanManager?.ClubRep ?? 0,
        }, players = players, staff = staff, clubs = clubs.Select(c => new Club {
            id = c.Id, name = c.Name, shortName = c.ShortName, nation = c.Nation,
            reputation = c.Reputation, div = c.Division, divisionId = c.DivisionId,
            transferBudget = c.TransferBudget, remainingTransfer = c.RemainingTransfer,
            wageBudget = c.WageBudget, wageUsed = c.WageUsed, remainingWage = c.RemainingWage, balance = c.Balance,
            trainingFacilities = c.TrainingFacilities, youthTrainingFacilities = c.YouthTrainingFacilities,
            youthRecruitment = c.YouthRecruitment, juniorCoaching = c.JuniorCoaching,
        }).ToList() };
        File.WriteAllText(Path.Combine(_dataDir, "diagnostics.txt"),
            $"FMSuperScout FM24 native reader\r\nPID: {_pid}\r\nModule: 0x{_moduleBase:X}-0x{_moduleEnd:X}\r\n" +
            $"Person table: {table.Pointers.Count:N0}\r\nPlayers: {players.Count:N0}\r\nStaff: {staff.Count:N0}\r\n" +
            $"Club database: {clubs.Count:N0}\r\nHuman manager: {humanManager?.Name ?? "not found"} ({humanManager?.Club ?? "no club"}, type 0x{humanManager?.PersonOffset ?? 0:X})\r\n" +
            $"Staff layout profiles [count,CA/PA,attrs>=18/23,known-job-byte]: {string.Join("; ", staffLayoutProfiles.OrderBy(x => x.Key).Select(x => $"0x{x.Key:X}=[{string.Join(",", x.Value)}]"))}\r\n" +
            $"Staff contract job IDs at +0x1C (including unmapped): {string.Join(", ", staffContractJobIds.OrderBy(x => x.Key).Select(x => $"{x.Key}:{x.Value:N0}"))}\r\n" +
            $"Staff layout samples: {string.Join("; ", staffLayoutSamples)}\r\n" +
            $"Staff contract role-byte candidates: {string.Join("; ", staffContractRoleBytes.OrderByDescending(x => x.Value.Values.Sum()).Take(16).Select(x => $"+0x{x.Key:X}=[{string.Join(",", x.Value.OrderByDescending(v => v.Value).Take(8).Select(v => $"{v.Key}:{v.Value:N0}"))}]"))}\r\n" +
            $"Team type histogram: {string.Join(", ", teamTypeCounts.OrderBy(x => x.Key).Select(x => $"{x.Key}={x.Value:N0}"))}\r\n" +
            $"Squad mapping: clubVectors={squadStats.ClubVectors:N0}, teamLinks={squadStats.TeamLinks:N0}, squadVectors={squadStats.SquadVectors:N0}, rosterSlots={squadStats.RosterSlots:N0}, matched={squadStats.Matches:N0}, playersAssigned={squadStats.Assigned:N0}, types=[{string.Join(", ", squadStats.TeamTypes.OrderBy(x => x.Key).Select(x => $"{x.Key}={x.Value:N0}"))}]\r\n" +
            $"Competition type histogram: {string.Join(", ", competitionTypeCounts.OrderBy(x => x.Key).Select(x => $"{x.Key}={x.Value:N0}"))}\r\n" +
            $"Class offsets sampled: {string.Join(", ", offsets.OrderBy(x => x).Select(x => $"0x{x:X}"))}\r\n" +
            $"Class offsets full table: {string.Join(", ", typeCounts.OrderByDescending(x => x.Value).Select(x => $"0x{x.Key:X}={x.Value:N0}"))}\r\n" +
            $"Game date: {date:yyyy-MM-dd} ({(_gameDate.HasValue ? "memory" : "derived")})\r\n");
        return dump;
    }

    /// <summary>
    /// Reads the active FM24 player list without dumping the complete database.
    /// FM26 exposes a stable list header. FM24 has a build-specific pointer to
    /// the active shortlist vector; use that when known, then retain the native
    /// row/vector shape detector as a fallback for other 24.x builds.
    /// </summary>
    public ShortlistSnapshot ReadShortlist()
    {
        WriteStatus("scanning", 0, 0, 0.02, null);
        // The shortlist is a small native UI structure, so look for it directly
        // before building the much larger person index used by the fallback.
        // The successful address is cached because FM24 keeps the same object
        // alive while the shortlist page remains open.
        var fastRegions = ReadableMemoryRegions();
        if (TryLoadGenieShortlistCache(fastRegions, out var genieCached))
            return genieCached;
        if (TryScanGenieShortlist(fastRegions, out var genie, out ulong genieAnchor))
        {
            SaveGenieShortlistCache(genieAnchor);
            WriteShortlistGenieDiagnostics(fastRegions, genieAnchor, genie.Ids);
            return genie;
        }
        if (TryLoadLegacyShortlistCache(fastRegions, out var cached))
            return cached;
        if (TryScanMirroredRows(fastRegions, out var fast, out ulong rowStart, out int stride))
        {
            SaveLegacyShortlistCache(rowStart, stride);
            WriteShortlistFastDiagnostics(fastRegions, rowStart, stride, fast.Ids);
            return fast;
        }

        return ReadShortlistFallback(fastRegions);
    }

    private ShortlistSnapshot ReadShortlistFallback(List<MemoryRegion> regions)
    {
        var table = FindPersonTable();
        var players = new Dictionary<ulong, uint>();
        var persons = new Dictionary<ulong, uint>();
        foreach (ulong person in table.Pointers)
        {
            uint uid = ReadU32(person + 0x0C);
            if (uid == 0) continue;
            persons[person] = uid;
            int type = ReadTypeOffset(person);
            if (type is not (0x278 or 0x138 or 0x368)) continue;
            ulong playerBase = person - (ulong)type;
            ushort ca = ReadU16(playerBase + 0x200), pa = ReadU16(playerBase + 0x202);
            if (ca is >= 1 and <= 200 && pa is >= 1 and <= 200 && pa >= ca - 30)
            {
                players[person] = uid;
                players.TryAdd(playerBase, uid);
            }
        }
        if (players.Count < 1000)
            throw new InvalidOperationException($"FM24 spelerdatabase bevatte te weinig valide spelers voor shortlist-detectie ({players.Count:N0}).");

        var candidates = new Dictionary<(ulong start, ulong end), ShortlistCandidate>();
        var shortlistPlayers = new Dictionary<uint, Person>();
        // FM's list objects are polymorphic. The first field is a vtable and the
        // vector is commonly at +0x10/+0x18 (same shape as the verified FM26 list),
        // but keep adjacent layouts because FM24 has multiple UI list classes.
        int[] vectorOffsets = { 0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38, 0x40 };
        var mirroredRows = new Dictionary<string, ShortlistCandidate>(StringComparer.Ordinal);
        const int chunkSize = 8 * 1024 * 1024;
        ulong scanned = 0, total = regions.Aggregate(0UL, (sum, x) => sum + x.Size), nextProgress = 64UL * 1024 * 1024;
        foreach (var region in regions)
        {
            for (ulong done = 0; done < region.Size;)
            {
                int want = (int)Math.Min((ulong)chunkSize, region.Size - done);
                byte[]? data = ReadBytes(region.Start + done, want);
                if (data == null) { done += (ulong)want; scanned += (ulong)want; continue; }
                int limit = data.Length - 8;
                for (int i = 0; i <= limit; i += 8)
                {
                    ulong header = BitConverter.ToUInt64(data, i);
                    ulong objectAddress = region.Start + done + (ulong)i;
                    if (i + 0x30 <= data.Length && BitConverter.ToUInt64(data, i + 0x28) == 0xFFFFFFFF00000000UL)
                    {
                        // FM24's Scouting/Shortlist page keeps compact row records.
                        // In the verified 24.4.2 layout the three visible rows are
                        // mirrored by the list/position view as [A,B,C,C,B,A].
                        // Detect that shape from live person pointers; the row stride
                        // is allocator/layout dependent, so probe the small native
                        // record strides instead of baking an address.
                        foreach (int stride in new[] { 0x20, 0x28, 0x30, 0x38, 0x40, 0x48, 0x50, 0x58, 0x60, 0x70, 0x80 })
                        {
                            if (i + 5 * stride + 8 > data.Length) continue;
                            uint[] rowIds = new uint[6];
                            bool ok = true;
                            for (int row = 0; row < rowIds.Length; row++)
                            {
                                ulong p = BitConverter.ToUInt64(data, i + row * stride);
                                if (!persons.TryGetValue(p, out rowIds[row])) rowIds[row] = ReadU32(p + 0x0C);
                                if (rowIds[row] == 0) { ok = false; break; }
                            }
                            if (!ok || rowIds[0] == 0 || rowIds[0] != rowIds[5] || rowIds[1] != rowIds[4] || rowIds[2] != rowIds[3]) continue;
                            if (rowIds[0] == rowIds[1] || rowIds[1] == rowIds[2]) continue;
                            // FM24 row records carry the same 64-bit row-state
                            // marker at +0x28. This rejects ordinary squad/cache
                            // tuples that happen to form a mirrored ID pattern.
                            if (i + 5 * stride + 0x30 + 8 > data.Length) continue;
                            ulong rowMarker = BitConverter.ToUInt64(data, i + 0x28);
                            if (rowMarker != 0xFFFFFFFF00000000UL) continue;
                            bool sameMarker = true;
                            for (int row = 1; row < 6; row++)
                                sameMarker &= BitConverter.ToUInt64(data, i + row * stride + 0x28) == rowMarker;
                            if (!sameMarker) continue;
                            bool rowShape = true;
                            for (int row = 0; row < 6 && rowShape; row++)
                                for (int field = 0x08; field <= 0x18; field += 0x08)
                                {
                                    ulong fieldPtr = BitConverter.ToUInt64(data, i + row * stride + field);
                                    rowShape &= fieldPtr >= 0x100000 && IsInReadableRegion(fieldPtr, regions);
                                }
                            if (!rowShape) continue;
                            var rowSet = new HashSet<uint> { rowIds[0], rowIds[1], rowIds[2] };
                            for (int row = 0; row < 3; row++)
                            {
                                ulong rowPerson = BitConverter.ToUInt64(data, i + row * stride);
                                try
                                {
                                    int rowType = ReadTypeOffset(rowPerson);
                                    if (rowType is 0x278 or 0x138 or 0x368)
                                    {
                                        var rowPlayer = ReadPlayer(rowPerson, rowIds[row], rowType);
                                        if (rowPlayer != null) shortlistPlayers[rowIds[row]] = rowPlayer;
                                    }
                                }
                                catch { }
                            }
                            string key = string.Join(',', rowSet.OrderBy(x => x));
                            mirroredRows[key] = new ShortlistCandidate(objectAddress,
                                objectAddress, objectAddress + 24, rowSet, 100, 1.0);
                        }
                    }
                    if (header < _moduleBase || header >= _moduleEnd) continue;
                    foreach (int offset in vectorOffsets)
                    {
                        if (i + offset + 16 > data.Length) continue;
                        ulong start = BitConverter.ToUInt64(data, i + offset);
                        ulong end = BitConverter.ToUInt64(data, i + offset + 8);
                        if (!LooksLikeVector(start, end, regions)) continue;
                        ulong count = (end - start) / 8;
                        if (count == 0 || count > 20_000) continue;
                        if (candidates.ContainsKey((start, end))) continue;
                        var ids = ReadVectorPlayerIds(start, count, players, 96, out int validSlots);
                        if (ids.Count < 3 || validSlots < Math.Min(3, (int)count)) continue;
                        double ratio = (double)validSlots / Math.Min(96, (int)count);
                        if (ratio < 0.50) continue;
                        candidates[(start, end)] = new ShortlistCandidate(objectAddress, start, end, ids, validSlots, ratio);
                    }
                }
                int advance = Math.Max(8, data.Length - 0x80);
                ulong step = (ulong)Math.Min(advance, (long)region.Size - (long)done);
                done += step;
                scanned += step;
                if (scanned >= nextProgress)
                {
                    WriteStatus("scanning", 0, 0, 0.02 + 0.90 * scanned / Math.Max(1.0, total), null);
                    nextProgress += 64UL * 1024 * 1024;
                }
            }
        }

        if (candidates.Count == 0 && mirroredRows.Count == 0)
            throw new InvalidOperationException("Actieve FM24-spelerslijst niet gevonden. Open FM24 > Scouting > Shortlist en probeer opnieuw.");

        // The active UI list is normally the smallest validated vector. Database,
        // squad and history vectors are much larger; tie-break on density and the
        // number of unique live player objects.
        var eligible = mirroredRows.Count > 0
            ? mirroredRows.Values.ToList()
            : candidates.Values.Where(x => x.Count >= 3 && x.Ids.Count >= 3).ToList();
        if (eligible.Count == 0)
            throw new InvalidOperationException("Er is geen valide FM24-shortlistvector met minimaal drie spelers gevonden. Open FM24 > Scouting > Shortlist en probeer opnieuw.");
        var best = eligible
            .OrderBy(x => x.Count)
            .ThenByDescending(x => x.Ratio)
            .ThenByDescending(x => x.Ids.Count)
            .First();
        WriteShortlistDiagnostics(regions, candidates.Values.Concat(mirroredRows.Values), best, players.Count);
        return new ShortlistSnapshot(best.Ids, shortlistPlayers.Values.ToList());
    }

    public sealed record ShortlistSnapshot(IReadOnlyCollection<uint> Ids, IReadOnlyCollection<Person> Players);

    private sealed record ShortlistCandidate(ulong Object, ulong Start, ulong End, HashSet<uint> Ids, int ValidSlots, double Ratio)
    {
        public ulong Count => (End - Start) / 8;
    }

    private bool LooksLikeVector(ulong start, ulong end, List<MemoryRegion> regions)
    {
        if (start < 0x100000 || end <= start || end - start > 8UL * 20_000 || (end - start) % 8 != 0) return false;
        return IsInReadableRegion(start, regions) && IsInReadableRegion(end - 8, regions);
    }

    private HashSet<uint> ReadVectorPlayerIds(ulong start, ulong count, Dictionary<ulong, uint> players, int probeCount, out int validSlots)
    {
        int probe = (int)Math.Min((ulong)probeCount, count);
        byte[]? data = ReadBytes(start, checked(probe * 8));
        validSlots = 0;
        var ids = new HashSet<uint>();
        if (data == null) return ids;
        for (int i = 0; i < probe; i++)
        {
            ulong entry = BitConverter.ToUInt64(data, i * 8);
            if (entry == 0) continue;
            if (players.TryGetValue(entry, out uint uid)) { ids.Add(uid); validSlots++; continue; }
            // A few FM24 list classes keep a small row wrapper instead of the
            // person pointer directly. Probe only the wrapper's first 0x80 bytes.
            for (int off = 0; off <= 0x80; off += 8)
            {
                ulong p = ReadPtr(entry + (ulong)off);
                if (p != 0 && players.TryGetValue(p, out uid)) { ids.Add(uid); validSlots++; break; }
            }
        }
        return ids;
    }

    private bool TryLoadGenieShortlistCache(List<MemoryRegion> regions, out ShortlistSnapshot snapshot)
    {
        snapshot = new ShortlistSnapshot(Array.Empty<uint>(), Array.Empty<Person>());
        string path = Path.Combine(_dataDir, "shortlist-cache.json");
        try
        {
            if (!File.Exists(path)) return false;
            using var document = System.Text.Json.JsonDocument.Parse(File.ReadAllText(path));
            var root = document.RootElement;
            if (!root.TryGetProperty("kind", out var kind) || kind.GetString() != "genie") return false;
            if (root.GetProperty("pid").GetInt32() != _pid) return false;
            ulong anchor = root.GetProperty("anchor").GetUInt64();
            if (TryReadGenieShortlistAt(anchor, regions, out snapshot)) return true;

            // The cached address can remain readable after FM has rebuilt its
            // save/UI objects, while no longer pointing at a populated list.
            // Drop it so this read discovers the current list from live memory.
            try { File.Delete(path); } catch { }
            return false;
        }
        catch
        {
            return false;
        }
    }

    private bool TryLoadLegacyShortlistCache(List<MemoryRegion> regions, out ShortlistSnapshot snapshot)
    {
        snapshot = new ShortlistSnapshot(Array.Empty<uint>(), Array.Empty<Person>());
        string path = Path.Combine(_dataDir, "shortlist-cache.json");
        try
        {
            if (!File.Exists(path)) return false;
            using var document = System.Text.Json.JsonDocument.Parse(File.ReadAllText(path));
            var root = document.RootElement;
            if (root.TryGetProperty("kind", out _)) return false;
            if (root.GetProperty("pid").GetInt32() != _pid) return false;
            ulong rowStart = root.GetProperty("row").GetUInt64();
            int stride = root.GetProperty("stride").GetInt32();
            if (!ShortlistStrides.Contains(stride)) return false;
            return TryReadMirroredRowsAt(rowStart, stride, regions, out snapshot);
        }
        catch
        {
            return false;
        }
    }

    private bool TryGetGenieShortlistSignature(out ulong signature)
    {
        signature = 0;
        try
        {
            var module = _process.MainModule;
            string? product = module?.FileVersionInfo.ProductVersion;
            string? fileVersion = module?.FileVersionInfo.FileVersion;
            if (!string.IsNullOrWhiteSpace(product))
            {
                int plus = product.LastIndexOf('+');
                if (plus >= 0 && int.TryParse(product[(plus + 1)..], out int build) &&
                    GenieShortlistSignatures.TryGetValue(build, out signature)) return true;
                // Some Windows builds expose only the dotted file version and
                // omit the numeric build suffix from ProductVersion.
                if (product.StartsWith("24.4.2", StringComparison.Ordinal) ||
                    fileVersion?.StartsWith("24.4.2", StringComparison.Ordinal) == true)
                {
                    signature = GenieShortlistSignatures[0x1FC423];
                    return true;
                }
            }
            if (fileVersion?.StartsWith("24.4.2", StringComparison.Ordinal) == true)
            {
                signature = GenieShortlistSignatures[0x1FC423];
                return true;
            }
            return false;
        }
        catch
        {
            return false;
        }
    }

    private bool TryScanGenieShortlist(List<MemoryRegion> regions, out ShortlistSnapshot snapshot, out ulong anchor)
    {
        snapshot = new ShortlistSnapshot(Array.Empty<uint>(), Array.Empty<Person>());
        anchor = 0;
        if (!TryGetGenieShortlistSignature(out ulong relativeSignature)) return false;
        ulong target = _moduleBase + relativeSignature;
        byte[] targetBytes = BitConverter.GetBytes(target);
        const int chunkSize = 8 * 1024 * 1024;
        ulong scanned = 0;
        ulong total = regions.Aggregate(0UL, (sum, x) => sum + x.Size);
        ulong nextProgress = 64UL * 1024 * 1024;
        foreach (var region in regions)
        {
            for (ulong done = 0; done < region.Size;)
            {
                int want = (int)Math.Min((ulong)chunkSize, region.Size - done);
                byte[]? data = ReadBytes(region.Start + done, want);
                if (data != null)
                {
                    ReadOnlySpan<byte> haystack = data;
                    int from = 0;
                    while (from <= haystack.Length - targetBytes.Length)
                    {
                        int hit = haystack[from..].IndexOf(targetBytes);
                        if (hit < 0) break;
                        ulong candidate = region.Start + done + (ulong)(from + hit);
                        if (TryReadGenieShortlistAt(candidate, regions, out var found))
                        {
                            snapshot = found;
                            anchor = candidate;
                            return true;
                        }
                        from += hit + 1;
                    }
                }
                done += (ulong)Math.Max(1, want);
                scanned += (ulong)Math.Max(1, want);
                if (scanned >= nextProgress)
                {
                    WriteStatus("scanning", 0, 0, 0.02 + 0.45 * scanned / Math.Max(1.0, total), null);
                    nextProgress += 64UL * 1024 * 1024;
                }
            }
        }
        return false;
    }

    private bool TryReadGenieShortlistAt(ulong anchor, List<MemoryRegion> regions, out ShortlistSnapshot snapshot)
    {
        snapshot = new ShortlistSnapshot(Array.Empty<uint>(), Array.Empty<Person>());
        if (!TryGetGenieShortlistSignature(out ulong relativeSignature) || anchor < 0x100000) return false;
        if (!IsInReadableRegion(anchor, regions) || ReadU64(anchor) != _moduleBase + relativeSignature) return false;
        ulong start = ReadU64(anchor + 0x18), end = ReadU64(anchor + 0x20);
        if (end < start || end - start > 400_000UL * 8 || (end - start) % 8 != 0) return false;
        ulong count = (end - start) / 8;
        // An empty vector is ambiguous: FM can leave an old shortlist object
        // alive while rebuilding a save. Treat it as a miss so callers rescan,
        // and never replace the user's saved shortlist with a stale zero result.
        if (count == 0) return false;
        if (!IsInReadableRegion(start, regions) || !IsInReadableRegion(end - 8, regions)) return false;
        byte[]? vector = ReadBytes(start, checked((int)(count * 8)));
        if (vector == null) return false;

        var ids = new List<uint>();
        var players = new List<Person>();
        var seen = new HashSet<uint>();
        for (int i = 0; i < (int)count; i++)
        {
            ulong entry = BitConverter.ToUInt64(vector, i * 8);
            if (entry == 0 || !TryResolveGeniePlayer(entry, out ulong person, out uint uid, out int type)) continue;
            if (!seen.Add(uid)) continue;
            ids.Add(uid);
            try
            {
                var player = ReadPlayer(person, uid, type);
                if (player != null) players.Add(player);
            }
            catch { }
        }
        if (ids.Count == 0) return false;
        snapshot = new ShortlistSnapshot(ids, players);
        return true;
    }

    private bool TryResolveGeniePlayer(ulong entry, out ulong person, out uint uid, out int type)
    {
        person = 0;
        uid = 0;
        type = 0;
        // The vector normally stores a small row wrapper; its first field is
        // the native person pointer. A few builds store the person directly,
        // so probe both forms.
        for (int offset = -8; offset <= 0x80; offset += 8)
        {
            ulong candidate = offset < 0 ? entry : ReadPtr(entry + (ulong)offset);
            if (candidate < 0x100000) continue;
            uint candidateId = ReadU32(candidate + 0x0C);
            if (candidateId < 1_000_000) continue;
            int candidateType = ReadTypeOffset(candidate);
            if (candidateType is not (0x278 or 0x138 or 0x368)) continue;
            person = candidate;
            uid = candidateId;
            type = candidateType;
            return true;
        }
        return false;
    }

    private void SaveGenieShortlistCache(ulong anchor)
    {
        try
        {
            string path = Path.Combine(_dataDir, "shortlist-cache.json");
            string tmp = path + ".tmp";
            File.WriteAllText(tmp, System.Text.Json.JsonSerializer.Serialize(new
            {
                kind = "genie",
                pid = _pid,
                anchor,
                at = DateTime.Now.ToString("s")
            }));
            File.Move(tmp, path, true);
        }
        catch { }
    }

    private void SaveLegacyShortlistCache(ulong rowStart, int stride)
    {
        try
        {
            string path = Path.Combine(_dataDir, "shortlist-cache.json");
            string tmp = path + ".tmp";
            File.WriteAllText(tmp, System.Text.Json.JsonSerializer.Serialize(new
            {
                pid = _pid,
                row = rowStart,
                stride,
                at = DateTime.Now.ToString("s")
            }));
            File.Move(tmp, path, true);
        }
        catch { }
    }

    private bool TryScanMirroredRows(List<MemoryRegion> regions, out ShortlistSnapshot snapshot, out ulong rowStart, out int stride)
    {
        snapshot = new ShortlistSnapshot(Array.Empty<uint>(), Array.Empty<Person>());
        rowStart = 0;
        stride = 0;
        byte[] markerBytes = BitConverter.GetBytes(ShortlistRowMarker);
        const int chunkSize = 8 * 1024 * 1024;
        ulong scanned = 0;
        ulong total = regions.Aggregate(0UL, (sum, x) => sum + x.Size);
        ulong nextProgress = 64UL * 1024 * 1024;
        foreach (var region in regions)
        {
            for (ulong done = 0; done < region.Size;)
            {
                int want = (int)Math.Min((ulong)chunkSize, region.Size - done);
                byte[]? data = ReadBytes(region.Start + done, want);
                if (data != null)
                {
                    // IndexOf uses the runtime's vectorized byte search. This
                    // avoids a managed loop over every 8-byte heap word.
                    ReadOnlySpan<byte> haystack = data;
                    int from = 0;
                    while (from <= haystack.Length - markerBytes.Length)
                    {
                        int hit = haystack[from..].IndexOf(markerBytes);
                        if (hit < 0) break;
                        int markerOffset = from + hit;
                        if (markerOffset >= 0x28)
                        {
                            ulong markerAddress = region.Start + done + (ulong)markerOffset;
                            ulong candidateRow = markerAddress - 0x28;
                            foreach (int candidateStride in ShortlistStrides)
                            {
                                if (TryReadMirroredRowsAt(candidateRow, candidateStride, regions, out var found))
                                {
                                    snapshot = found;
                                    rowStart = candidateRow;
                                    stride = candidateStride;
                                    return true;
                                }
                            }
                        }
                        from += hit + 1;
                    }
                }

                int advance = Math.Max(1, want);
                done += (ulong)advance;
                scanned += (ulong)advance;
                if (scanned >= nextProgress)
                {
                    WriteStatus("scanning", 0, 0, 0.02 + 0.45 * scanned / Math.Max(1.0, total), null);
                    nextProgress += 64UL * 1024 * 1024;
                }
            }
        }
        return false;
    }

    private bool TryReadMirroredRowsAt(ulong rowStart, int stride, List<MemoryRegion> regions, out ShortlistSnapshot snapshot)
    {
        snapshot = new ShortlistSnapshot(Array.Empty<uint>(), Array.Empty<Person>());
        if (!ShortlistStrides.Contains(stride) || rowStart < 0x100000) return false;
        var rowIds = new uint[6];
        var rowPointers = new ulong[6];
        for (int row = 0; row < rowIds.Length; row++)
        {
            ulong rowAddress = rowStart + (ulong)(row * stride);
            if (!IsInReadableRegion(rowAddress, regions) || !IsInReadableRegion(rowAddress + 0x30, regions)) return false;
            if (ReadU64(rowAddress + 0x28) != ShortlistRowMarker) return false;
            ulong pointer = ReadPtr(rowAddress);
            if (pointer < 0x100000 || !IsInReadableRegion(pointer, regions)) return false;
            uint id = ReadU32(pointer + 0x0C);
            if (id == 0) return false;
            rowPointers[row] = pointer;
            rowIds[row] = id;
            for (int field = 0x08; field <= 0x18; field += 0x08)
            {
                ulong fieldPointer = ReadU64(rowAddress + (ulong)field);
                if (fieldPointer < 0x100000 || !IsInReadableRegion(fieldPointer, regions)) return false;
            }
        }

        if (rowIds[0] != rowIds[5] || rowIds[1] != rowIds[4] || rowIds[2] != rowIds[3] ||
            rowIds[0] == rowIds[1] || rowIds[1] == rowIds[2]) return false;

        var players = new List<Person>();
        var seen = new HashSet<uint>();
        for (int row = 0; row < 3; row++)
        {
            int type = ReadTypeOffset(rowPointers[row]);
            if (type is not (0x278 or 0x138 or 0x368)) continue;
            var player = ReadPlayer(rowPointers[row], rowIds[row], type);
            if (player != null && seen.Add(player.id)) players.Add(player);
        }
        snapshot = new ShortlistSnapshot(new HashSet<uint>(rowIds.Take(3)), players);
        return true;
    }

    private void WriteShortlistFastDiagnostics(List<MemoryRegion> regions, ulong rowStart, int stride, IReadOnlyCollection<uint> ids)
    {
        try
        {
            File.WriteAllText(Path.Combine(_dataDir, "shortlist-diagnostics.txt"),
                $"FM24 shortlist direct scan\r\nPID: {_pid}\r\nReadable regions: {regions.Count:N0}\r\n" +
                $"Selected row=0x{rowStart:X} stride=0x{stride:X} count={ids.Count} ids={string.Join(",", ids)}\r\n");
        }
        catch { }
    }

    private void WriteShortlistGenieDiagnostics(List<MemoryRegion> regions, ulong anchor, IReadOnlyCollection<uint> ids)
    {
        try
        {
            File.WriteAllText(Path.Combine(_dataDir, "shortlist-diagnostics.txt"),
                $"FM24 shortlist signature scan\r\nPID: {_pid}\r\nReadable regions: {regions.Count:N0}\r\n" +
                $"Selected active shortlist anchor=0x{anchor:X} vector-offset=0x18 count={ids.Count} ids={string.Join(",", ids)}\r\n");
        }
        catch { }
    }

    private void WriteShortlistDiagnostics(List<MemoryRegion> regions, IEnumerable<ShortlistCandidate> candidates, ShortlistCandidate best, int playerPointers)
    {
        try
        {
            var rows = candidates.OrderBy(x => x.Count).Take(32)
                .Select(x => $"object=0x{x.Object:X} vector=0x{x.Start:X}-0x{x.End:X} count={x.Count} ids={x.Ids.Count} valid={x.ValidSlots} ratio={x.Ratio:0.00}");
            File.WriteAllText(Path.Combine(_dataDir, "shortlist-diagnostics.txt"),
                $"FM24 shortlist vector scan\r\nPID: {_pid}\r\nReadable regions: {regions.Count:N0}\r\nPlayer pointers: {playerPointers:N0}\r\n" +
                $"Selected: object=0x{best.Object:X} vector=0x{best.Start:X}-0x{best.End:X} count={best.Count} ids={best.Ids.Count}\r\n" +
                string.Join("\r\n", rows) + "\r\n");
        }
        catch { }
    }

    private Person? ReadPlayer(ulong person, uint uid, int typeOffset)
    {
        ulong pl = person - (ulong)typeOffset;
        ushort ca = ReadU16(pl + 0x200), pa = ReadU16(pl + 0x202);
        if (ca is < 1 or > 200 || pa is < 1 or > 200 || pa < ca - 30) return null;
        string name = ReadPersonName(person);
        if (name == "?") return null;
        var p = new Person { id = uid, name = name, ca = ca, pa = pa, attrs = new() };
        (p.birthYear, p.birthDoy) = ReadBirth(person);
        p.dob = p.birthYear > 0 ? $"{p.birthYear:D4}" : null;
        p.nat = ReadNation(person, out int natId);
        p.natId = natId;
        int h = ReadU16(pl + 0x1BA); p.height = h is >= 140 and <= 220 ? h : null;
        foreach (var (key, off) in Attrs) p.attrs[key] = Attr(ReadByte(pl + 0x217 + (ulong)off));
        int left = p.attrs["LeftFoot"];
        int right = p.attrs["RightFoot"];
        p.footLeft = left; p.footRight = right;
        p.foot = left >= 14 && right >= 14 ? "Beide" : right >= left ? "Rechts" : "Links";
        var positions = new List<(string key, int value)>();
        foreach (var (key, off) in Positions)
        {
            int value = Math.Clamp((int)ReadByte(pl + 0x208 + (ulong)off), 0, 20);
            if (value > 0) positions.Add((key, value));
        }
        p.posArr = positions.OrderByDescending(x => x.value).Select(x => x.key).ToList();
        p.posProficiency = positions.ToDictionary(x => x.key, x => x.value);
        int top = positions.Count == 0 ? 0 : positions.Max(x => x.value);
        p.pos = string.Join(", ", positions.Where(x => x.value >= Math.Max(15, top - 2)).OrderByDescending(x => x.value).Select(x => x.key));
        p.value = Money(ReadU32(pl + 0x1B0));
        p.worldRep = ReadU16(pl + 0x1FE);
        p.adaptability = Attr(ReadByte(person + 0x78)); p.ambition = Attr(ReadByte(person + 0x79));
        p.loyalty = Attr(ReadByte(person + 0x7A)); p.pressure = Attr(ReadByte(person + 0x7B));
        p.professionalism = Attr(ReadByte(person + 0x7C)); p.sportsmanship = Attr(ReadByte(person + 0x7D));
        p.temperament = Attr(ReadByte(person + 0x7E)); p.controversy = Attr(ReadByte(person + 0x7F));
        ReadContract(person, p);
        return p;
    }

    private Person? ReadStaff(ulong person, uint uid, int typeOffset)
    {
        string name = ReadPersonName(person);
        if (name == "?") return null;
        var s = new Person { id = uid, name = name, staffAttrs = new() };
        (s.birthYear, s.birthDoy) = ReadBirth(person);
        s.dob = s.birthYear > 0 ? $"{s.birthYear:D4}" : null;
        s.nat = ReadNation(person, out int natId); s.natId = natId;
        ulong staffBase = person - (ulong)typeOffset;
        ushort ca = ReadU16(staffBase + StaffCaOffset), pa = ReadU16(staffBase + StaffPaOffset);
        if (ca is >= 1 and <= 200 && pa is >= 1 and <= 200 && pa >= ca - 30) { s.ca = ca; s.pa = pa; }
        foreach (var (key, off) in StaffAttrs)
        {
            int raw = ReadByte(staffBase + StaffAttrsOffset + (ulong)off);
            if (raw is >= 1 and <= 100)
                s.staffAttrs[key] = DirectStaffAttrs.Contains(key) && raw <= 20 ? raw : Attr((byte)raw);
        }
        ReadContract(person, s);
        ulong contract = ReadPtr(person + 0xC8);
        if (contract != 0)
        {
            int jobId = ReadByte(contract + 0x1C);
            if (jobId is > 0 and < byte.MaxValue)
            {
                s.jobId = jobId;
                s.job = JobNames.GetValueOrDefault(jobId) ?? $"Unknown ({jobId})";
            }
        }
        return s;
    }

    // Offsets are relative to StaffAttrsOffset (0x18 in the FM24 24.4.x layout).
    private static readonly (string key, int offset)[] StaffAttrs =
    {
        ("Attacking", 0x22), ("Defending", 0x23), ("Fitness", 0x24), ("BallControl", 0x25),
        ("Technical", 0x26), ("Tactical", 0x27), ("SetPieces", 0x33), ("Determination", 0x0D),
        ("LevelOfDiscipline", 0x04), ("ManManagement", 0x1E), ("Motivating", 0x1F), ("JudgingPlayerAbility", 0x1C),
        ("JudgingPlayerPotential", 0x1D), ("JudgingStaffAbility", 0x32), ("Negotiating", 0x31),
        ("TacticalKnowledge", 0x21), ("Physiotherapy", 0x20), ("SportsScience", 0x2F),
        ("DataAnalysis", 0x2C), ("WorkingWithYoungsters", 0x0C), ("GKDistribution", 0x2A),
        ("GKHandling", 0x29), ("GKShotStopping", 0x1B),
    };

    // Discipline and Working With Youngsters use the native 1-20 scale. Other
    // staff attributes in this block use the 1-100 scale and are divided by 5.
    private static readonly HashSet<string> DirectStaffAttrs = new(StringComparer.Ordinal)
    {
        "LevelOfDiscipline", "WorkingWithYoungsters",
    };

    private static readonly Dictionary<int, string> JobNames = new()
    {
        [1] = "Player", [2] = "Coach", [3] = "Player/Coach", [4] = "Chairman", [6] = "Director",
        [8] = "Managing Director", [10] = "Director of Football", [12] = "Physiotherapist", [14] = "Scout",
        [16] = "Manager", [17] = "Player/Manager", [20] = "Assistant Manager", [21] = "Player/Assistant Manager",
        [22] = "Set Piece Coach", [24] = "General Manager", [26] = "Fitness Coach", [27] = "Player/Fitness Coach",
        [34] = "Goalkeeping Coach", [35] = "Player/Goalkeeping Coach", [36] = "Head of Data Analysis", [38] = "Club Doctor",
        [40] = "Head of Sports Science", [42] = "Data Analyst", [44] = "Chief Scout", [45] = "Player/Chief Scout",
        [46] = "Doctor", [48] = "Sports Scientist", [49] = "Player/Youth Coach", [50] = "Head Physio",
        [52] = "U19 Manager", [54] = "First Team Coach", [64] = "Head of Youth Development",
        [65] = "Player/Head of Youth Development", [66] = "Owner", [70] = "President", [86] = "Loan Manager",
        [88] = "Technical Director", [144] = "Caretaker Manager",
    };

    private void ReadContract(ulong person, Person p)
    {
        ulong contract = ReadPtr(person + 0xC8);
        if (contract == 0) return;
        uint wage = ReadU32(contract + 0x18); p.wage = Money(wage);
        DateTime? expiry = DecodeDate(ReadU32(contract + 0x40));
        p.expires = expiry is { Year: >= 2000 } ? expiry.Value.ToString("yyyy-MM-dd") : null;
        uint flags = ReadU32(contract + 0x48);
        // FM24 PFFL bits: bit 3 listed by request, bit 5 set for release.
        // Bit 0 is not a transfer-list flag (treating it as one marked almost
        // every player as listed in large saves).
        p.listed = (flags & ((1 << 3) | (1 << 5))) != 0;
        p.loanListed = (flags & (1 << 1)) != 0 && (flags & (1 << 6)) == 0;
        p.notForSale = (flags & (1 << 4)) != 0;
        p.setForRelease = (flags & (1 << 5)) != 0;
        ulong team = ReadPtr(contract + 0x10);
        if (team != 0) ReadTeam(team, p);
        ulong loan = ReadPtr(person + 0xD0);
        if (loan != 0)
        {
            ulong loanContract = ReadPtr(loan);
            if (loanContract != 0)
            {
                ulong loanTeam = ReadPtr(loanContract + 0x10);
                if (loanTeam != 0) { p.ownerClub = p.club; p.ownerClubId = p.clubId; ReadTeam(loanTeam, p); }
            }
        }
    }

    private void ReadTeam(ulong team, Person p)
    {
        int rep = ReadU16(team + 0xA8);
        p.clubRep = rep is >= 1 and <= 10000 ? rep : null;
        int teamType = ReadByte(team + 0x28);
        p.teamType = teamType <= 63 ? teamType : null;
        ulong club = ReadPtr(team + 0x30);
        if (club != 0)
        {
            p.club = ReadNameEntry(ReadPtr(club + 0xC0)) ?? p.club;
            uint id = ReadU32(club + 0x0C);
            if (id != 0 && id != uint.MaxValue) p.clubId = id;
        }
        ulong comp = ReadPtr(team + 0x50);
        if (comp != 0)
        {
            var competition = ReadCompetition(comp);
            p.divisionId = competition.Id;
            p.div = competition.Name ?? p.div;
        }
    }

    // Competition objects use the same database-object ID slot as clubs. The full
    // competition name (+0x40) retains country/sponsor qualifiers; the short name
    // (+0x48) is only a fallback for older/incomplete objects.
    private (uint? Id, string? Name) ReadCompetition(ulong competition)
    {
        uint id = ReadU32(competition + 0x0C);
        uint? competitionId = id is 0 or uint.MaxValue ? null : id;
        string? name = ReadNameEntry(ReadPtr(competition + 0x40))
            ?? ReadNameEntry(ReadPtr(competition + 0x48));
        return (competitionId, name);
    }

    private List<string> ReadNation(ulong person, out int natId)
    {
        natId = 0;
        ulong nation = ReadPtr(person + 0x70);
        if (nation == 0) return new();
        natId = (int)ReadU32(nation + 0x0C);
        string? name = ReadNameEntry(ReadPtr(nation + 0x18)) ?? ReadNameEntry(ReadPtr(nation + 0x20));
        return string.IsNullOrWhiteSpace(name) ? new() : new List<string> { name };
    }

    private string ReadPersonName(ulong person)
    {
        string? common = ReadNameEntry(ReadPtr(person + 0x68));
        if (!string.IsNullOrWhiteSpace(common)) return common;
        string? first = ReadNameEntry(ReadPtr(person + 0x58));
        string? last = ReadNameEntry(ReadPtr(person + 0x60));
        return string.Join(" ", new[] { first, last }.Where(x => !string.IsNullOrWhiteSpace(x))).Trim() is { Length: > 0 } full ? full : "?";
    }

    private string? ReadNameEntry(ulong entry)
    {
        if (entry == 0) return null;
        string? direct = ReadText(entry + 4);
        if (LooksLikeText(direct)) return direct;
        ulong nested = ReadPtr(entry);
        if (nested != 0)
        {
            string? indirect = ReadText(nested + 4);
            if (LooksLikeText(indirect)) return indirect;
        }
        return null;
    }

    private string? ReadText(ulong address)
    {
        byte[]? data = ReadBytes(address, 160);
        if (data == null) return null;
        int n = Array.IndexOf(data, (byte)0); if (n < 0) n = data.Length;
        if (n == 0) return null;
        try
        {
            string utf8 = Encoding.UTF8.GetString(data, 0, n).Trim();
            if (LooksLikeText(utf8)) return utf8;
            string utf16 = Encoding.Unicode.GetString(data, 0, n - (n & 1)).Trim('\0', ' ');
            return LooksLikeText(utf16) ? utf16 : null;
        }
        catch { return null; }
    }

    private static bool LooksLikeText(string? s) => !string.IsNullOrWhiteSpace(s) && s.Length <= 100 && s.Count(c => char.IsControl(c) && c != '\t') == 0;

    private (int year, int doy) ReadBirth(ulong person)
    {
        int year = ReadU16(person + 0x46), doy = ReadU16(person + 0x44);
        return year is >= 1900 and <= 2100 && doy is >= 1 and <= 366 ? (year, doy) : (0, 0);
    }

    private DateTime? FindGameDate()
    {
        byte?[] pattern = Pattern("83 F2 01 8B 05 ?? ?? ?? ?? 66 09");
        var matches = ScanModule(pattern).Take(100).ToList();
        foreach (var match in matches)
        {
            int rel = ReadI32(match + 5);
            ulong target = (ulong)((long)match + 9 + rel);
            uint raw = ReadU32(target);
            var date = DecodeDate(raw);
            if (date.HasValue && date.Value.Year is >= 2020 and <= 2100) return date;
        }
        return null;
    }

    private PersonTable FindPersonTable()
    {
        byte?[] pattern = Pattern("48 8D 0D ?? ?? ?? ?? 48 8D 15");
        PersonTable? best = null;
        int bestScore = 0;
        var candidates = new List<string>();
        foreach (var match in ScanModule(pattern))
        {
            int rel = ReadI32(match + 3);
            ulong dbt = (ulong)((long)match + 7 + rel);
            ulong personDb = ReadPtr(dbt + 0x68);
            ulong table = ReadPtr(personDb + 0x80);
            ulong start = ReadPtr(table), end = ReadPtr(table + 8);
            if (start == 0 || end <= start || end - start > 8UL * 500_000 || (end - start) % 8 != 0) continue;
            int count = checked((int)((end - start) / 8));
            var pointers = ReadPointers(start, count);
            if (pointers.Count < Math.Min(count, 50)) continue;
            int score = 0;
            foreach (ulong person in pointers.Take(200))
            {
                if (ReadU32(person + 0x0C) == 0) continue;
                int type = ReadTypeOffset(person);
                if (type is >= 0x20 and <= 0x600) score++;
            }
            candidates.Add($"0x{start:X}+{count:N0} score={score}");
            if (score > bestScore) { bestScore = score; best = new PersonTable(dbt, pointers); }
        }
        if (best != null && bestScore > 0) return best;
        throw new InvalidOperationException("FM24 person database signature gevonden, maar geen geldige objecttabel. Kandidaten: " +
            string.Join("; ", candidates) + ". Controleer dat een save volledig geladen is en dat de FM24-build wordt ondersteund.");
    }

    private List<ClubInfo> ReadClubCatalog(ulong databaseRoot, out Dictionary<int, int> teamTypes, out Dictionary<int, int> competitionTypes)
    {
        teamTypes = new Dictionary<int, int>();
        competitionTypes = new Dictionary<int, int>();
        var clubs = new Dictionary<ulong, ClubInfo>();
        var clubPointers = ReadDatabaseVector(databaseRoot + 0x10, 200_000);
        foreach (ulong ptr in clubPointers)
        {
            uint id = ReadU32(ptr + 0x0C);
            ulong nameEntry = ReadPtr(ptr + 0xC0);
            ulong shortEntry = ReadPtr(ptr + 0xC8);
            string? name = ReadNameEntry(nameEntry);
            string? shortName = ReadNameEntry(shortEntry);
            if (string.IsNullOrWhiteSpace(name)) name = shortName;
            if (string.IsNullOrWhiteSpace(name) || name == "?") continue;
            ulong nationPtr = ReadPtr(ptr + 0xD8);
            string? nation = nationPtr == 0 ? null :
                ReadNameEntry(ReadPtr(nationPtr + 0x18)) ?? ReadNameEntry(ReadPtr(nationPtr + 0x20));
            // Some lower-division FM24 club records place the nation link one
            // pointer later than the standard club layout.
            if (string.IsNullOrWhiteSpace(nation))
            {
                nationPtr = ReadPtr(ptr + 0xE0);
                if (nationPtr != 0)
                    nation = ReadNameEntry(ReadPtr(nationPtr + 0x18)) ?? ReadNameEntry(ReadPtr(nationPtr + 0x20));
            }
            var club = new ClubInfo(ptr, id, name, shortName, nation);
            ReadClubDetails(club);
            clubs[ptr] = club;
        }

        var teamPointers = ReadDatabaseVector(databaseRoot + 0x98, 200_000);
        foreach (ulong team in teamPointers)
        {
            ulong clubPtr = ReadPtr(team + 0x30);
            if (!clubs.TryGetValue(clubPtr, out var club)) continue;
            int reputation = ReadU16(team + 0xA8);
            if (reputation is < 0 or > 10000) reputation = 0;
            int teamType = ReadByte(team + 0x28);
            teamTypes[teamType] = teamTypes.GetValueOrDefault(teamType) + 1;
            if (reputation > club.Reputation) club.Reputation = reputation;
            club.TeamPointers.Add(team);

            ulong competition = ReadPtr(team + 0x50);
            if (competition == 0) continue;
            int competitionType = ReadByte(competition + 0xF4);
            competitionTypes[competitionType] = competitionTypes.GetValueOrDefault(competitionType) + 1;
            var competitionInfo = ReadCompetition(competition);
            string? division = competitionInfo.Name;
            if (string.IsNullOrWhiteSpace(division)) continue;

            // FM24 competition types 0 and 1 are senior leagues; reserves/youth use
            // separate types. Prefer the senior team with the strongest team reputation.
            bool senior = competitionType <= 1;
            int divisionPriority = teamType == 0 ? 2 : senior ? 1 : 0;
            if (divisionPriority > club.DivisionPriority || (divisionPriority == club.DivisionPriority && reputation > club.DivisionRep))
            {
                club.Division = division;
                club.DivisionId = competitionInfo.Id;
                club.DivisionRep = reputation;
                club.DivisionPriority = divisionPriority;
            }
        }
        return clubs.Values.ToList();
    }

    private void ReadClubDetails(ClubInfo club)
    {
        ulong clubInfo = ReadPtr(club.Address + ClubInfoPointerOffset);
        if (clubInfo != 0)
        {
            byte[]? facilities = ReadBytes(clubInfo + (ulong)ClubTrainingFacilitiesOffset,
                ClubYouthRecruitmentOffset - ClubTrainingFacilitiesOffset + 1);
            if (facilities != null)
            {
                club.TrainingFacilities = Facility(facilities[0]);
                club.YouthTrainingFacilities = Facility(facilities[ClubYouthFacilitiesOffset - ClubTrainingFacilitiesOffset]);
                club.JuniorCoaching = Facility(facilities[ClubJuniorCoachingOffset - ClubTrainingFacilitiesOffset]);
                club.YouthRecruitment = Facility(facilities[ClubYouthRecruitmentOffset - ClubTrainingFacilitiesOffset]);
            }
        }

        ulong finance = ReadPtr(club.Address + ClubFinancePointerOffset);
        if (finance == 0 || !ClubFinanceMarkers.Contains(ReadU16(finance))) return;

        club.Balance = ReadI32(finance + (ulong)ClubBalanceOffset);

        byte[]? transfer = ReadBytes(finance + (ulong)ClubRemainingTransferOffset, sizeof(uint) * 2);
        if (transfer != null)
        {
            club.RemainingTransfer = ClubMoney(BitConverter.ToUInt32(transfer, 0));
            club.TransferBudget = ClubMoney(BitConverter.ToUInt32(transfer, sizeof(uint)));
        }

        byte[]? wages = ReadBytes(finance + (ulong)ClubWeeklyWageBudgetOffset,
            ClubWeeklyWageTotalWithBonusesOffset - ClubWeeklyWageBudgetOffset + sizeof(uint));
        if (wages != null)
        {
            club.WageBudget = ClubMoney(BitConverter.ToUInt32(wages, 0));
            long? weeklyWageTotalWithBonuses = ClubMoney(BitConverter.ToUInt32(wages,
                ClubWeeklyWageTotalWithBonusesOffset - ClubWeeklyWageBudgetOffset));
            club.WageUsed = weeklyWageTotalWithBonuses;
            // Use the bonus-inclusive weekly commitment so the remaining figure
            // does not overstate how much wage room the club has.
            if (weeklyWageTotalWithBonuses.HasValue && club.WageBudget.HasValue)
                club.RemainingWage = club.WageBudget.Value - weeklyWageTotalWithBonuses.Value;
        }
    }

    private static int? Facility(byte value) => value <= 20 ? value : null;
    private static long? ClubMoney(uint value) => value == uint.MaxValue ? null : value;

    private SquadScanStats ApplySquadMembership(List<ClubInfo> clubs, Dictionary<ulong, Person> playersByAddress)
    {
        var stats = new SquadScanStats();
        var assignments = new Dictionary<uint, SquadAssignment>();
        var playersById = playersByAddress.GroupBy(x => x.Value.id).ToDictionary(x => x.Key, x => x.First().Value);
        foreach (var club in clubs)
        {
            ulong begin = ReadPtr(club.Address + 0x18), end = ReadPtr(club.Address + 0x20);
            var linkedTeams = new List<ulong>();
            if (begin != 0 && end > begin && (end - begin) % 8 == 0 && (end - begin) / 8 <= 64)
            {
                stats.ClubVectors++;
                linkedTeams = ReadPointers(begin, (int)((end - begin) / 8))
                    .Where(club.TeamPointers.Contains).Distinct().ToList();
            }
            if (linkedTeams.Count == 0) linkedTeams = club.TeamPointers;
            stats.TeamLinks += linkedTeams.Count;

            foreach (ulong team in linkedTeams)
            {
                ulong rosterBegin = ReadPtr(team + 0x38), rosterEnd = ReadPtr(team + 0x40);
                if (rosterBegin == 0 || rosterEnd <= rosterBegin || (rosterEnd - rosterBegin) % 8 != 0) continue;
                ulong slotCount = (rosterEnd - rosterBegin) / 8;
                if (slotCount > 250) continue;
                stats.SquadVectors++;
                stats.RosterSlots += (int)slotCount;
                int teamType = ReadByte(team + 0x28);
                int rep = ReadU16(team + 0xA8);
                ulong comp = ReadPtr(team + 0x50);
                (uint? Id, string? Name) competitionInfo = comp == 0 ? default : ReadCompetition(comp);
                string? division = competitionInfo.Name;
                byte[]? entries = ReadBytes(rosterBegin, checked((int)slotCount * 8));
                if (entries == null) continue;
                for (int i = 0; i < (int)slotCount; i++)
                {
                    ulong entry = BitConverter.ToUInt64(entries, i * 8);
                    if (entry == 0) continue;
                    Person? person = FindRosterPerson(entry, playersByAddress, playersById);
                    if (person == null) continue;
                    if (teamType == 0) club.SeniorSquadPlayerIds.Add(person.id);
                    stats.Matches++;
                    if (!assignments.TryGetValue(person.id, out var current) ||
                        IsBetterSquadAssignment(club, teamType, current, person))
                        assignments[person.id] = new SquadAssignment(club, team, teamType, rep, competitionInfo.Id, division);
                }
            }
        }

        foreach (var (playerId, assignment) in assignments)
        {
            var p = playersById[playerId];
            var club = assignment.Club;
            p.club = club.Name;
            p.clubId = club.Id;
            p.clubRep = assignment.Reputation is >= 1 and <= 10000 ? assignment.Reputation : null;
            p.teamType = assignment.TeamType <= 63 ? assignment.TeamType : null;
            p.divisionId = assignment.DivisionId;
            if (!string.IsNullOrWhiteSpace(assignment.Division)) p.div = assignment.Division;
            stats.TeamTypes[assignment.TeamType] = stats.TeamTypes.GetValueOrDefault(assignment.TeamType) + 1;
        }
        foreach (var club in clubs)
        {
            // Clubs without a loaded senior squad often expose template finance data.
            // Keep the earlier safety gate so these values are not shown as real budgets.
            if (club.SeniorSquadPlayerIds.Count < 11 ||
                club.TransferBudget > MaxPlausibleClubTransferBudget ||
                club.RemainingTransfer > MaxPlausibleClubTransferBudget ||
                club.WageBudget > MaxPlausibleWeeklyWageBudget ||
                club.WageUsed > MaxPlausibleWeeklyWageBudget)
                club.ClearFinances();
        }
        stats.Assigned = assignments.Count;
        return stats;
    }

    private Person? FindRosterPerson(ulong entry, Dictionary<ulong, Person> playersByAddress, Dictionary<uint, Person> playersById)
    {
        if (playersByAddress.TryGetValue(entry, out var direct)) return direct;
        if (entry <= uint.MaxValue && playersById.TryGetValue((uint)entry, out var directId)) return directId;
        byte[]? wrapper = ReadBytes(entry, 0x88);
        if (wrapper == null) return null;
        for (int offset = 0; offset + 8 <= wrapper.Length; offset += 8)
        {
            ulong candidate = BitConverter.ToUInt64(wrapper, offset);
            if (playersByAddress.TryGetValue(candidate, out var found)) return found;
        }
        return null;
    }

    private static bool IsBetterSquadAssignment(ClubInfo club, int teamType, SquadAssignment current, Person player)
    {
        bool candidateCurrentClub = player.clubId == club.Id;
        bool existingCurrentClub = player.clubId == current.Club.Id;
        if (candidateCurrentClub != existingCurrentClub) return candidateCurrentClub;
        if (club.Id == current.Club.Id) return teamType < current.TeamType;
        // A player's current contract/loan team is authoritative if more than one
        // active squad vector contains that person.
        return candidateCurrentClub;
    }

    private List<ulong> ReadDatabaseVector(ulong databaseSlot, int maxCount)
    {
        ulong database = ReadPtr(databaseSlot);
        ulong table = database == 0 ? 0 : ReadPtr(database + 0x80);
        ulong start = table == 0 ? 0 : ReadPtr(table);
        ulong end = table == 0 ? 0 : ReadPtr(table + 8);
        if (start == 0 || end <= start || (end - start) % 8 != 0 || (end - start) / 8 > (ulong)maxCount)
            return new();
        return ReadPointers(start, (int)((end - start) / 8));
    }

    private HumanManagerInfo? FindHumanManager(List<ClubInfo> clubs)
    {
        byte?[] pattern = Pattern("48 8B 35 ?? ?? ?? ?? 48 8B 56 18 4C 8B 76 20 49 29 D6 B0 01 49 83 FE 10");
        var byAddress = clubs.ToDictionary(c => c.Address);
        foreach (ulong match in ScanModule(pattern).Take(100))
        {
            int rel = ReadI32(match + 3);
            ulong root = ReadPtr((ulong)((long)match + 7 + rel));
            if (root == 0) continue;
            ulong start = ReadPtr(root + 0x18), end = ReadPtr(root + 0x20);
            var managerBases = new List<ulong>();
            if (start != 0 && end > start && (end - start) % 8 == 0 && (end - start) <= 0x2000)
                managerBases = ReadPointers(start, (int)((end - start) / 8));
            if (managerBases.Count == 0) managerBases.Add(root);

            HumanManagerInfo? fallback = null;
            foreach (ulong managerBase in managerBases)
            for (int personOffset = 0x80; personOffset <= 0x900; personOffset += 8)
            {
                ulong person = managerBase + (ulong)personOffset;
                if (ReadTypeOffset(person) != personOffset) continue;
                uint uid = ReadU32(person + 0x0C);
                if (uid == 0 || uid == uint.MaxValue) continue;
                string name = ReadPersonName(person);
                if (name == "?") continue;
                ulong contract = ReadPtr(person + 0xC8);
                ulong team = contract == 0 ? 0 : ReadPtr(contract + 0x10);
                ulong clubPtr = team == 0 ? 0 : ReadPtr(team + 0x30);
                if (clubPtr != 0 && byAddress.TryGetValue(clubPtr, out var club))
                {
                    int rep = ReadU16(team + 0xA8);
                    return new HumanManagerInfo(person, personOffset, uid, name, club.Name, club.Id,
                        rep is >= 1 and <= 10000 ? rep : 0);
                }
                fallback ??= new HumanManagerInfo(person, personOffset, uid, name, "", 0, 0);
            }
            if (fallback != null) return fallback;
        }
        return null;
    }

    private HashSet<int> DiscoverOffsets(PersonTable table)
    {
        var offsets = new HashSet<int>();
        var sampleSize = Math.Min(12000, table.Pointers.Count);
        var stride = Math.Max(1, table.Pointers.Count / sampleSize);
        foreach (ulong person in table.Pointers.Where((_, index) => index % stride == 0).Take(sampleSize))
        {
            int offset = ReadTypeOffset(person);
            if (offset is > 0 and < 0x1000)
            {
                offsets.Add(offset);
            }
        }
        return offsets;
    }

    private int ReadTypeOffset(ulong person)
    {
        ulong vtable = ReadPtr(person);
        if (vtable < 0x10000) return 0;
        ulong typeInfo = ReadPtr(vtable - 8);
        return typeInfo == 0 ? 0 : (int)ReadU32(typeInfo + 4);
    }

    private List<ulong> ReadPointers(ulong address, int count)
    {
        byte[]? data = ReadBytes(address, checked(count * 8));
        if (data == null) return new();
        var result = new List<ulong>(count);
        for (int i = 0; i < count; i++)
        {
            ulong p = BitConverter.ToUInt64(data, i * 8);
            if (p != 0) result.Add(p);
        }
        return result;
    }

    private IEnumerable<ulong> ScanModule(byte?[] pattern)
    {
        ulong address = _moduleBase;
        while (address < _moduleEnd)
        {
            if (VirtualQueryEx(_handle, (IntPtr)unchecked((long)address), out var mbi, (UIntPtr)Marshal.SizeOf<MEMORY_BASIC_INFORMATION>()) == UIntPtr.Zero)
                break;
            ulong regionStart = (ulong)mbi.BaseAddress.ToInt64();
            ulong regionEnd = regionStart + mbi.RegionSize.ToUInt64();
            if (regionEnd <= address) break;
            ulong start = Math.Max(address, Math.Max(regionStart, _moduleBase));
            ulong end = Math.Min(regionEnd, _moduleEnd);
            if (mbi.State == MemCommit && IsExecutable(mbi.Protect) && end > start)
            {
                const int chunk = 1024 * 1024;
                int overlap = pattern.Length - 1;
                for (ulong part = start; part < end; part += (ulong)chunk - (ulong)overlap)
                {
                    int size = (int)Math.Min((ulong)chunk, end - part);
                    byte[]? data = ReadBytes(part, size);
                    if (data == null) continue;
                    for (int i = 0; i <= data.Length - pattern.Length; i++)
                    {
                        bool ok = true;
                        for (int j = 0; j < pattern.Length; j++) if (pattern[j].HasValue && data[i + j] != pattern[j]!.Value) { ok = false; break; }
                        if (ok) yield return part + (ulong)i;
                    }
                    if (size < chunk) break;
                }
            }
            address = regionEnd;
        }
    }

    private sealed record MemoryRegion(ulong Start, ulong Size)
    {
        public ulong End => Start + Size;
    }

    private List<MemoryRegion> ReadableMemoryRegions()
    {
        var result = new List<MemoryRegion>();
        ulong address = 0x10000;
        const ulong max = 0x7FFFFFFFFFFF;
        while (address < max)
        {
            if (VirtualQueryEx(_handle, (IntPtr)unchecked((long)address), out var mbi,
                    (UIntPtr)Marshal.SizeOf<MEMORY_BASIC_INFORMATION>()) == UIntPtr.Zero)
                break;
            ulong start = (ulong)mbi.BaseAddress.ToInt64();
            ulong size = mbi.RegionSize.ToUInt64();
            if (size == 0 || start + size <= address) break;
            // FM24's shortlist objects are native heap objects in private RW
            // allocations. Skipping mapped/module/readonly pages is the key
            // difference between an interactive probe and a multi-minute full
            // address-space sweep; person database validation still prevents
            // arbitrary heap vectors from being accepted.
            if (mbi.State == MemCommit && mbi.Type == 0x20000 &&
                (mbi.Protect & (0x04 | 0x08 | PageExecuteReadWrite | PageExecuteWriteCopy)) != 0 &&
                (mbi.Protect & PageGuard) == 0 && size <= 16UL * 1024 * 1024)
                result.Add(new MemoryRegion(start, size));
            address = start + size;
        }
        return result;
    }

    private static bool IsInReadableRegion(ulong address, List<MemoryRegion> regions)
    {
        int lo = 0, hi = regions.Count - 1;
        while (lo <= hi)
        {
            int mid = lo + ((hi - lo) / 2);
            var r = regions[mid];
            if (address < r.Start) hi = mid - 1;
            else if (address >= r.End) lo = mid + 1;
            else return true;
        }
        return false;
    }

    private static bool IsExecutable(uint protect) => (protect & PageGuard) == 0 &&
        (protect & (PageExecute | PageExecuteRead | PageExecuteReadWrite | PageExecuteWriteCopy)) != 0;

    private static bool IsReadable(uint protect) => (protect & PageNoAccess) == 0 &&
        (protect & (0x02 | 0x04 | 0x08 | PageExecute | PageExecuteRead | PageExecuteReadWrite | PageExecuteWriteCopy)) != 0;

    private byte[]? ReadBytes(ulong address, int size)
    {
        if (size <= 0 || size > 64 * 1024 * 1024) return null;
        byte[] data = new byte[size];
        if (!ReadProcessMemory(_handle, (IntPtr)unchecked((long)address), data, data.Length, out IntPtr got) || got.ToInt64() != size) return null;
        return data;
    }
    private ulong ReadPtr(ulong address) { byte[]? b = ReadBytes(address, 8); return b == null ? 0 : BitConverter.ToUInt64(b, 0); }
    private ulong ReadU64(ulong address) => ReadPtr(address);
    private uint ReadU32(ulong address) { byte[]? b = ReadBytes(address, 4); return b == null ? 0 : BitConverter.ToUInt32(b, 0); }
    private int ReadI32(ulong address) => unchecked((int)ReadU32(address));
    private ushort ReadU16(ulong address) { byte[]? b = ReadBytes(address, 2); return b == null ? (ushort)0 : BitConverter.ToUInt16(b, 0); }
    private byte ReadByte(ulong address) { byte[]? b = ReadBytes(address, 1); return b == null ? (byte)0 : b[0]; }
    private static int Attr(byte raw) => raw == 0 ? 0 : Math.Clamp((raw + 2) / 5, 1, 20);
    private static long? Money(uint value) => value == 0 ? null : value;
    private static int AgeAt(int year, int doy, DateTime date) => year > 0 ? Math.Clamp(date.Year - year - (doy > date.DayOfYear ? 1 : 0), 0, 80) : 0;

    private static DateTime? DecodeDate(uint raw)
    {
        int year = (int)(raw >> 16), doy = (int)(raw & 0x1ff);
        if (year is < 1900 or > 2100 || doy is < 1 or > 366) return null;
        try { return new DateTime(year, 1, 1).AddDays(doy - 1); } catch { return null; }
    }
    private static byte?[] Pattern(string text) => text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(x => x == "??" ? null : Convert.ToByte(x, 16) as byte?).ToArray();

    private void WriteStatus(string state, int players, int staff, double progress, string? error)
    {
        try
        {
            var value = new { state, players, staff, progress, error, at = DateTime.Now.ToString("s") };
            string path = Path.Combine(_dataDir, "status.json"), tmp = path + ".tmp";
            File.WriteAllText(tmp, System.Text.Json.JsonSerializer.Serialize(value)); File.Move(tmp, path, true);
        }
        catch { }
    }

    public void Dispose()
    {
        if (_handle != IntPtr.Zero) CloseHandle(_handle);
        _process.Dispose();
    }

    private sealed record PersonTable(ulong DatabaseRoot, List<ulong> Pointers);
    private sealed record HumanManagerInfo(ulong Person, int PersonOffset, uint Id, string Name, string Club, uint ClubId, int ClubRep);
    private sealed record SquadAssignment(ClubInfo Club, ulong Team, int TeamType, int Reputation, uint? DivisionId, string? Division);
    private sealed class SquadScanStats
    {
        public int ClubVectors { get; set; }
        public int TeamLinks { get; set; }
        public int SquadVectors { get; set; }
        public int RosterSlots { get; set; }
        public int Matches { get; set; }
        public int Assigned { get; set; }
        public Dictionary<int, int> TeamTypes { get; } = new();
    }
    private sealed class ClubInfo
    {
        public ClubInfo(ulong address, uint id, string name, string? shortName, string? nation)
        {
            Address = address; Id = id; Name = name; ShortName = shortName; Nation = nation;
        }
        public ulong Address { get; }
        public uint Id { get; }
        public string Name { get; }
        public string? ShortName { get; }
        public string? Nation { get; }
        public int Reputation { get; set; }
        public int DivisionRep { get; set; }
        public int DivisionPriority { get; set; }
        public string? Division { get; set; }
        public uint? DivisionId { get; set; }
        public long? TransferBudget { get; set; }
        public long? RemainingTransfer { get; set; }
        public long? WageBudget { get; set; }
        public long? WageUsed { get; set; }
        public long? RemainingWage { get; set; }
        public long? Balance { get; set; }
        public int? TrainingFacilities { get; set; }
        public int? YouthTrainingFacilities { get; set; }
        public int? YouthRecruitment { get; set; }
        public int? JuniorCoaching { get; set; }
        public List<ulong> TeamPointers { get; } = new();
        public HashSet<uint> SeniorSquadPlayerIds { get; } = new();
        public void ClearFinances()
        {
            TransferBudget = null; RemainingTransfer = null; WageBudget = null; WageUsed = null; RemainingWage = null; Balance = null;
        }
    }

    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer, int size, out IntPtr read);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern UIntPtr VirtualQueryEx(IntPtr process, IntPtr address, out MEMORY_BASIC_INFORMATION information, UIntPtr length);

    [StructLayout(LayoutKind.Sequential)]
    private struct MEMORY_BASIC_INFORMATION
    {
        public IntPtr BaseAddress;
        public IntPtr AllocationBase;
        public uint AllocationProtect;
        public uint Alignment1;
        public UIntPtr RegionSize;
        public uint State;
        public uint Protect;
        public uint Type;
        public uint Alignment2;
    }
}
