using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace FMSuperScout.Reader;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = null,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
    };

    public static int Main(string[] args)
    {
        string dataDir = Path.Combine(
            Environment.GetEnvironmentVariable("LOCALAPPDATA") ??
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "AppData", "Local"),
            "FMSuperScout24");
        Directory.CreateDirectory(dataDir);
        bool shortlistOnly = args.Any(x => x.Equals("--shortlist", StringComparison.OrdinalIgnoreCase));
        WriteStatus(dataDir, "scanning", 0, 0, 0, null);
        if (shortlistOnly) WriteShortlistState(dataDir, "scanning", null, null);

        try
        {
            int pid = ReadPid(args);
            using var reader = new Fm24Reader(pid, dataDir);
            if (shortlistOnly)
            {
                var shortlist = reader.ReadShortlist();
                WriteShortlist(dataDir, shortlist);
                WriteStatus(dataDir, "done", 0, 0, 1, null);
                return 0;
            }
            var result = reader.Scan();
            WriteJson(dataDir, result);
            WriteStatus(dataDir, "done", result.Players.Count, result.Staff.Count, 1, null);
            return 0;
        }
        catch (Exception e)
        {
            string message = e.Message;
            try { File.WriteAllText(Path.Combine(dataDir, "diagnostics.txt"), "FM24 reader\r\n" + e); } catch { }
            if (shortlistOnly) WriteShortlistState(dataDir, "error", message, null);
            WriteStatus(dataDir, "error", 0, 0, 0, message);
            Console.Error.WriteLine(message);
            return 1;
        }
    }

    private static int ReadPid(string[] args)
    {
        for (int i = 0; i + 1 < args.Length; i++)
            if (args[i].Equals("--pid", StringComparison.OrdinalIgnoreCase) && int.TryParse(args[i + 1], out int pid))
                return pid;

        var candidates = Process.GetProcessesByName("fm").Where(p =>
        {
            try { return !p.HasExited && p.MainWindowHandle != IntPtr.Zero; } catch { return false; }
        }).ToList();
        if (candidates.Count == 0)
            throw new InvalidOperationException("FM24 draait niet (fm.exe niet gevonden). Start FM24 en laad een save.");
        try { return candidates.OrderByDescending(p => p.WorkingSet64).First().Id; }
        finally { foreach (var p in candidates) p.Dispose(); }
    }

    private static void WriteJson(string dataDir, Dump dump)
    {
        string path = Path.Combine(dataDir, "dump.json");
        string tmp = path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(dump, JsonOptions), new UTF8Encoding(false));
        try
        {
            File.Move(tmp, path, true);
        }
        catch (IOException)
        {
            MoveDumpFallback(dataDir, tmp);
        }
        catch (UnauthorizedAccessException)
        {
            MoveDumpFallback(dataDir, tmp);
        }
    }

    private static void MoveDumpFallback(string dataDir, string tmp)
    {
        string fallback = Path.Combine(dataDir, $"dump-{DateTime.UtcNow:yyyyMMdd-HHmmssfff}.json");
        File.Move(tmp, fallback);
    }

    private static void WriteShortlist(string dataDir, Fm24Reader.ShortlistSnapshot shortlist)
    {
        string path = Path.Combine(dataDir, "shortlist-FM24.json");
        string tmp = path + ".tmp";
        var value = new { state = "done", count = shortlist.Ids.Count, ids = shortlist.Ids, players = shortlist.Players, at = DateTime.Now.ToString("s") };
        File.WriteAllText(tmp, JsonSerializer.Serialize(value, JsonOptions), new UTF8Encoding(false));
        File.Move(tmp, path, true);
    }

    private static void WriteShortlistState(string dataDir, string state, string? error, IReadOnlyCollection<uint>? ids)
    {
        string path = Path.Combine(dataDir, "shortlist-FM24.json");
        string tmp = path + ".tmp";
        var value = new { state, count = ids?.Count ?? 0, ids = ids ?? Array.Empty<uint>(), error, at = DateTime.Now.ToString("s") };
        File.WriteAllText(tmp, JsonSerializer.Serialize(value, JsonOptions), new UTF8Encoding(false));
        File.Move(tmp, path, true);
    }

    private static void WriteStatus(string dataDir, string state, int players, int staff, double progress, string? error)
    {
        try
        {
            var status = new { state, players, staff, progress, error, at = DateTime.Now.ToString("s") };
            string path = Path.Combine(dataDir, "status.json");
            string tmp = path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(status, JsonOptions), new UTF8Encoding(false));
            File.Move(tmp, path, true);
        }
        catch { }
    }
}

internal sealed class Dump
{
    public DumpMeta meta { get; set; } = new();
    public List<Person> players { get; set; } = new();
    public List<Person> staff { get; set; } = new();
    public List<Club> clubs { get; set; } = new();
    [JsonIgnore] public List<Person> Players => players;
    [JsonIgnore] public List<Person> Staff => staff;
}

internal sealed class Club
{
    public uint id { get; set; }
    public string name { get; set; } = "";
    public string? shortName { get; set; }
    public string? nation { get; set; }
    public int reputation { get; set; }
    public string? div { get; set; }
    public uint? divisionId { get; set; }
    public long? transferBudget { get; set; }
    public long? remainingTransfer { get; set; }
    public long? wageBudget { get; set; }
    public long? wageUsed { get; set; }
    public long? remainingWage { get; set; }
    public long? balance { get; set; }
    public int? trainingFacilities { get; set; }
    public int? youthTrainingFacilities { get; set; }
    public int? youthRecruitment { get; set; }
    public int? juniorCoaching { get; set; }
}

internal sealed class DumpMeta
{
    public string generated { get; set; } = DateTime.Now.ToString("s");
    public string gameDate { get; set; } = DateTime.Now.ToString("yyyy-MM-dd");
    public string gameDateSource { get; set; } = "derived";
    public int gameYear { get; set; } = DateTime.Now.Year;
    public string pluginVersion { get; set; } = "reader-0.1.0";
    public string gameVersion { get; set; } = "FM24 native memory";
    public string supportedVersion { get; set; } = "24.x";
    public bool versionOk { get; set; } = true;
    public string manager { get; set; } = "";
    public string myClub { get; set; } = "";
    public uint myClubId { get; set; }
    public int myClubRep { get; set; }
    public string currency { get; set; } = "GBP";
    public string source { get; set; } = "FMSuperScout 24 FM24 native memory reader";
    public bool gameShortlistFound { get; set; }
    public List<uint> gameShortlist { get; set; } = new();
}

internal sealed class Person
{
    public uint id { get; set; }
    public string name { get; set; } = "?";
    public int age { get; set; }
    public string? dob { get; set; }
    public int birthYear { get; set; }
    public int birthDoy { get; set; }
    public List<string> nat { get; set; } = new();
    public int natId { get; set; }
    public string? club { get; set; }
    public uint? clubId { get; set; }
    public string? ownerClub { get; set; }
    public uint? ownerClubId { get; set; }
    public string? div { get; set; }
    public uint? divisionId { get; set; }
    public int? ca { get; set; }
    public int? pa { get; set; }
    public long? wage { get; set; }
    public string? expires { get; set; }
    public string? pos { get; set; }
    public List<string>? posArr { get; set; }
    public Dictionary<string, int>? posProficiency { get; set; }
    public int? teamType { get; set; }
    public string? foot { get; set; }
    public int? footLeft { get; set; }
    public int? footRight { get; set; }
    public int? height { get; set; }
    public long? value { get; set; }
    public long? askingPrice { get; set; }
    public long? wageDemand { get; set; }
    public bool? listed { get; set; }
    public bool? loanListed { get; set; }
    public bool? notForSale { get; set; }
    public bool? setForRelease { get; set; }
    public int? clubRep { get; set; }
    public int? worldRep { get; set; }
    public int? ambition { get; set; }
    public int? loyalty { get; set; }
    public int? professionalism { get; set; }
    public int? adaptability { get; set; }
    public int? pressure { get; set; }
    public int? sportsmanship { get; set; }
    public int? temperament { get; set; }
    public int? controversy { get; set; }
    public Dictionary<string, int>? attrs { get; set; }
    public string? job { get; set; }
    public int? jobId { get; set; }
    public Dictionary<string, int>? staffAttrs { get; set; }
}
