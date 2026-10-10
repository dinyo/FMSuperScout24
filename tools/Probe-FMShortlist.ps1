param(
    [Parameter(Mandatory = $true)]
    [int] $FmPid
)

$outDir = Join-Path $env:LOCALAPPDATA 'FMSuperScout'
$outFile = Join-Path $outDir 'shortlist-probe-admin.log'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$source = @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class FmShortlistProbe
{
    [StructLayout(LayoutKind.Sequential)]
    private struct MBI
    {
        public ulong BaseAddress, AllocationBase;
        public uint AllocationProtect, Align1;
        public ulong RegionSize;
        public uint State, Protect, Type, Align2;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern ulong VirtualQueryEx(IntPtr process, ulong address, out MBI mbi, ulong length);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReadProcessMemory(IntPtr process, ulong address, byte[] buffer, UIntPtr length, out UIntPtr copied);

    private const uint QueryRead = 0x0410;
    private const uint MemCommit = 0x1000;
    private const uint PageNoAccess = 0x01;
    private const uint PageGuard = 0x100;
    private const ulong HeaderRva = 0x04697278;

    private static int Read(IntPtr process, ulong address, byte[] buffer, int length)
    {
        UIntPtr copied;
        ReadProcessMemory(process, address, buffer, (UIntPtr)(uint)length, out copied);
        ulong n = (ulong)copied;
        return n > (ulong)length ? length : (int)n;
    }

    private static ulong Ptr(IntPtr process, ulong address)
    {
        var b = new byte[8];
        return Read(process, address, b, b.Length) == b.Length ? BitConverter.ToUInt64(b, 0) : 0;
    }

    private static uint U32(IntPtr process, ulong address)
    {
        var b = new byte[4];
        return Read(process, address, b, b.Length) == b.Length ? BitConverter.ToUInt32(b, 0) : 0;
    }

    private static ushort U16(IntPtr process, ulong address)
    {
        var b = new byte[2];
        return Read(process, address, b, b.Length) == b.Length ? BitConverter.ToUInt16(b, 0) : (ushort)0;
    }

    private static int DynamicOffset(IntPtr process, ulong vtable)
    {
        ulong meta = vtable >= 8 ? Ptr(process, vtable - 8) : 0;
        return meta == 0 ? 0 : unchecked((int)U32(process, meta + 4));
    }

    public static string Scan(int pid)
    {
        var processInfo = Process.GetProcessById(pid);
        ulong gpBase = 0;
        foreach (ProcessModule module in processInfo.Modules)
            if (string.Equals(module.ModuleName, "game_plugin.dll", StringComparison.OrdinalIgnoreCase))
                gpBase = (ulong)module.BaseAddress.ToInt64();
        if (gpBase == 0) return "ERROR game_plugin.dll tidak ditemukan";

        IntPtr process = OpenProcess(QueryRead, false, (uint)pid);
        if (process == IntPtr.Zero) return "ERROR OpenProcess: " + Marshal.GetLastWin32Error();
        try
        {
            ulong expected = gpBase + HeaderRva, address = 0x10000, max = 0x7FFFFFFFFFFF;
            int regions = 0, readFailures = 0, partials = 0, unreadPages = 0, candidates = 0;
            ulong bytes = 0;
            var text = new StringBuilder();
            text.AppendLine(string.Format("pid={0} game_plugin=0x{1:X} header=0x{2:X}", pid, gpBase, expected));
            var buf = new byte[8 * 1024 * 1024];
            MBI mbi;
            while (address < max && VirtualQueryEx(process, address, out mbi, (ulong)Marshal.SizeOf<MBI>()) != 0)
            {
                if (mbi.RegionSize == 0) break;
                ulong next = mbi.BaseAddress + mbi.RegionSize;
                if (mbi.State == MemCommit && (mbi.Protect & (PageNoAccess | PageGuard)) == 0)
                {
                    regions++; bytes += mbi.RegionSize;
                    for (ulong done = 0; done < mbi.RegionSize;)
                    {
                        int want = (int)Math.Min((ulong)buf.Length, mbi.RegionSize - done);
                        int got = Read(process, mbi.BaseAddress + done, buf, want);
                        bool full = got == want;
                        if (!full) { readFailures++; if (got > 0) partials++; }
                        if (got < 8)
                        {
                            unreadPages++;
                            done += Math.Min(4096UL, mbi.RegionSize - done);
                            continue;
                        }
                        for (int i = 0; i + 8 <= got; i += 8)
                        {
                            if (BitConverter.ToUInt64(buf, i) != expected) continue;
                            ulong p = mbi.BaseAddress + done + (ulong)i;
                            // FM26.3.2: [header][auxiliary pointer][vector start][vector end].
                            ulong start = Ptr(process, p + 16), end = Ptr(process, p + 24);
                            long count = end > start && start >= 0x300000 && (end - start) % 8 == 0
                                ? (long)((end - start) / 8) : -1;
                            text.AppendLine(string.Format("candidate 0x{0:X}: start=0x{1:X} end=0x{2:X} count={3}", p, start, end, count));
                            if (count > 0 && count <= 10)
                                for (long n = 0; n < count; n++)
                                {
                                    ulong entry = Ptr(process, start + (ulong)n * 8);
                                    text.AppendLine(string.Format("  entry[{0}]=0x{1:X} vtable=0x{2:X} uid@+0xC={3}", n, entry, Ptr(process, entry), U32(process, entry + 0xC)));
                                    for (int wrap = -1; wrap <= 16; wrap++)
                                    {
                                        ulong person = wrap < 0 ? entry : Ptr(process, entry + (ulong)wrap * 8);
                                        if (person == 0) continue;
                                        int offset = DynamicOffset(process, Ptr(process, person));
                                        if (offset != 0x288 && offset != 0x380) continue;
                                        ulong playerBase = person - (ulong)offset;
                                        text.AppendLine(string.Format("    player wrap={0} person=0x{1:X} uid={2} ca={3} pa={4}", wrap, person, U32(process, person + 0xC), U16(process, playerBase + 0x264), U16(process, playerBase + 0x266)));
                                    }
                                }
                            candidates++;
                        }
                        int advance = full ? Math.Max(8, got - 32) : Math.Max(4096, got - 32);
                        done += Math.Min((ulong)advance, mbi.RegionSize - done);
                    }
                }
                address = next > address ? next : max;
            }
            text.AppendLine(string.Format("regions={0} mb={1} failed={2} partial={3} unreadPages={4} candidates={5}", regions, bytes / (1024 * 1024), readFailures, partials, unreadPages, candidates));
            return text.ToString();
        }
        finally { CloseHandle(process); }
    }
}
'@

Add-Type -TypeDefinition $source -ErrorAction Stop
[IO.File]::WriteAllText($outFile, [FmShortlistProbe]::Scan($FmPid))
Write-Output $outFile
