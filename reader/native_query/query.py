"""Run verified FM24 transfer and playing-time calculations on FM's UI thread."""
import argparse
import ctypes as c
from ctypes import wintypes as w
import hashlib
import json
from collections import OrderedDict
from pathlib import Path
import struct
import sys

from process_read import ProcessReader
from inprocess import InProcessFailure, InProcessQuery, InProcessUnavailable

BUILD_SHA = '33e8a2e48c4986f2a15e11c4c93aca1199029d66b19bd765403eb22dea265378'
PREFIXES = {
    0x21953e0: '4157415641554154565755534881ec280100000f29b42410',
    0x21b9560: '5541574156415541545657534881ec68010000488dac2480',
    0x48706b0: '4157415641554154565755534883ec5840b601803db94bbc',
    0x486fe50: '4157415641554154565755534883ec5840b501803d1954bc',
    0x49dab60: '55564883ec28488d6c242048c74500feffffff4889cec741',
    0x39c4950: '5541574156415541545657534881ec78010000488dac2480',
    0x4b661d5: '410fbe4654',
    0x4a88d00: '5541574156415541545657534881ecc8000000',
    0x2737920: '89d00fb7c98d917cfcffff83fa1e',
    0x2735890: '440fb6c1b001418d48ed',
}
LEVELS = ['Doubtful', 'Unsure', 'Slightly Interested', 'Interested', 'Very Interested', 'Extremely Interested']

class QueryUnavailable(RuntimeError):
    pass

class ProcessEntry(c.Structure):
    _fields_ = [('size', w.DWORD), ('usage', w.DWORD), ('pid', w.DWORD), ('heap', c.c_size_t),
                ('module', w.DWORD), ('threads', w.DWORD), ('parent', w.DWORD), ('priority', c.c_long),
                ('flags', w.DWORD), ('exe', w.WCHAR * 260)]

class ThreadEntry(c.Structure):
    _fields_ = [(name, w.DWORD) for name in ('size', 'usage', 'tid', 'pid')] + [('priority', c.c_long), ('delta', c.c_long), ('flags', w.DWORD)]

class ThreadInfo(c.Structure):
    _fields_ = [('exit', c.c_long), ('teb', c.c_void_p), ('pid', c.c_void_p), ('tid', c.c_void_p),
                ('affinity', c.c_size_t), ('priority', c.c_long), ('base_priority', c.c_long)]

class ModuleInfo(c.Structure):
    _fields_ = [('base', c.c_void_p), ('size', w.DWORD), ('entry', c.c_void_p)]

def find_game():
    k = c.WinDLL('kernel32', use_last_error=True)
    k.CreateToolhelp32Snapshot.argtypes = [w.DWORD, w.DWORD]
    k.CreateToolhelp32Snapshot.restype = w.HANDLE
    k.Process32FirstW.argtypes = [w.HANDLE, c.POINTER(ProcessEntry)]
    k.Process32NextW.argtypes = [w.HANDLE, c.POINTER(ProcessEntry)]
    k.CloseHandle.argtypes = [w.HANDLE]
    snapshot = k.CreateToolhelp32Snapshot(2, 0)
    row = ProcessEntry(size=c.sizeof(ProcessEntry))
    found = []
    try:
        valid = k.Process32FirstW(snapshot, c.byref(row))
        while valid:
            if row.exe.casefold() == 'fm.exe':
                found.append(row.pid)
            valid = k.Process32NextW(snapshot, c.byref(row))
    finally:
        k.CloseHandle(snapshot)
    if len(found) != 1:
        raise QueryUnavailable('Exactly one running FM24 process is required.')
    return found[0]

_verified_files = {}
_player_indexes = {}

class Game(ProcessReader):
    def __init__(self, pid):
        super().__init__(pid)
        self.pid = pid
        self._person_uid_pages = OrderedDict()
        p = c.WinDLL('psapi', use_last_error=True)
        p.EnumProcessModulesEx.argtypes = [w.HANDLE, c.POINTER(w.HMODULE), w.DWORD, c.POINTER(w.DWORD), w.DWORD]
        p.GetModuleInformation.argtypes = [w.HANDLE, w.HMODULE, c.POINTER(ModuleInfo), w.DWORD]
        p.GetModuleFileNameExW.argtypes = [w.HANDLE, w.HMODULE, w.LPWSTR, w.DWORD]
        mods, needed = (w.HMODULE * 2048)(), w.DWORD()
        if not p.EnumProcessModulesEx(self.h, mods, c.sizeof(mods), c.byref(needed), 3):
            raise QueryUnavailable('FM module list is unavailable.')
        info, filename = ModuleInfo(), c.create_unicode_buffer(32768)
        if not p.GetModuleInformation(self.h, mods[0], c.byref(info), c.sizeof(info)):
            raise QueryUnavailable('FM module information is unavailable.')
        p.GetModuleFileNameExW(self.h, mods[0], filename, len(filename))
        self.base = info.base
        self.path = Path(filename.value)
        stat = self.path.stat()
        file_key = (str(self.path), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)
        digest = _verified_files.get(file_key)
        if digest is None:
            with self.path.open('rb') as file:
                digest = hashlib.file_digest(file, 'sha256').hexdigest()
            _verified_files.clear()
            _verified_files[file_key] = digest
        if digest != BUILD_SHA:
            raise QueryUnavailable('This FM executable has not been verified for native transfer queries.')
        for rva, prefix in PREFIXES.items():
            expected = bytes.fromhex(prefix)
            if self.read(self.base + rva, len(expected)) != expected:
                raise QueryUnavailable('FM native code differs from the verified build.')
        self.teb = self.main_thread_teb()
        root = self.ptr(self.base + 0x6365118)
        first, last = self.ptr(root + 0x18), self.ptr(root + 0x20)
        if not first or last <= first or last - first > 0x2000 or (last - first) % 8:
            raise QueryUnavailable('No active human manager was found.')
        self.manager = 0
        managers = []
        for at in range(first, last, 8):
            manager = self.ptr(at)
            person = manager + 0x450
            team = self.ptr(self.ptr(person + 0xc8) + 0x10)
            club = self.ptr(team + 0x30)
            if self.type_offset(person) == 0x450 and club:
                managers.append((manager, person, team, club))
        if len(managers) > 1:
            raise QueryUnavailable('Multiple human managers are active; buyer selection is required.')
        if managers:
            self.manager, self.manager_person, self.team, self.club = managers[0]
        if not self.manager:
            raise QueryUnavailable('The active manager has no readable club.')
        self.levels = struct.unpack('<7i', self.read(self.base + 0x6324328, 28) or bytes(28))
        if self.levels != (-100000, -10000, -2000, 0, 5000, 10000, 30000):
            raise QueryUnavailable('FM interest thresholds differ from the verified build.')

    def person_uid(self, person):
        address = person + 0xc
        page = address & ~0xfff
        if page not in self._person_uid_pages:
            self._person_uid_pages[page] = self.read(page, 4096)
            if len(self._person_uid_pages) > 4096:
                self._person_uid_pages.popitem(last=False)
        else:
            self._person_uid_pages.move_to_end(page)
        raw = self._person_uid_pages[page]
        if raw is None:
            return self.u32(address)
        offset = address - page
        if offset + 4 > len(raw):
            return self.u32(address)
        return struct.unpack_from('<I', raw, offset)[0]

    def main_thread_teb(self):
        k = self.k
        k.CreateToolhelp32Snapshot.argtypes = [w.DWORD, w.DWORD]
        k.CreateToolhelp32Snapshot.restype = w.HANDLE
        k.Thread32First.argtypes = [w.HANDLE, c.POINTER(ThreadEntry)]
        k.Thread32Next.argtypes = [w.HANDLE, c.POINTER(ThreadEntry)]
        k.OpenThread.argtypes = [w.DWORD, w.BOOL, w.DWORD]
        k.OpenThread.restype = w.HANDLE
        k.GetThreadTimes.argtypes = [w.HANDLE] + [c.POINTER(c.c_ulonglong)] * 4
        nt = c.WinDLL('ntdll')
        nt.NtQueryInformationThread.argtypes = [w.HANDLE, c.c_ulong, c.c_void_p, c.c_ulong, c.c_void_p]
        snapshot = k.CreateToolhelp32Snapshot(4, 0)
        entry = ThreadEntry(size=c.sizeof(ThreadEntry))
        candidates = []
        try:
            valid = k.Thread32First(snapshot, c.byref(entry))
            while valid:
                if entry.pid == self.pid:
                    thread = k.OpenThread(0x40, False, entry.tid)
                    if thread:
                        times = [c.c_ulonglong() for _ in range(4)]
                        ti = ThreadInfo()
                        if k.GetThreadTimes(thread, *[c.byref(t) for t in times]) and nt.NtQueryInformationThread(thread, 0, c.byref(ti), c.sizeof(ti), None) == 0:
                            candidates.append((times[0].value, entry.tid, ti.teb))
                        k.CloseHandle(thread)
                valid = k.Thread32Next(snapshot, c.byref(entry))
        finally:
            k.CloseHandle(snapshot)
        if not candidates:
            raise QueryUnavailable('FM thread context is unavailable.')
        return min(candidates)[2]

    def players(self, ids):
        db = self.ptr(self.base + 0x642ecd0 + 0x68)
        vector = self.ptr(db + 0x80)
        start, end = self.ptr(vector), self.ptr(vector + 8)
        if not start or not start < end <= start + 8 * 500000 or (end - start) % 8:
            raise QueryUnavailable('FM person database is unavailable.')
        key = (self.pid, self.base, start, end)
        index = _player_indexes.get(key)
        if index is None or any(uid not in index or self.person_uid(index[uid]) != uid for uid in ids):
            raw = self.read(start, end - start)
            if raw is None:
                raise QueryUnavailable('FM person database could not be read.')
            index = {}
            for (person,) in struct.iter_unpack('<Q', raw):
                uid = self.person_uid(person)
                if uid:
                    index[uid] = person
            _player_indexes.clear()
            _player_indexes[key] = index
        found = {}
        for uid in ids:
            person = index.get(uid)
            if not person or self.person_uid(person) != uid:
                continue
            offset = self.type_offset(person)
            if offset in (0x138, 0x278):
                player = person - offset
                if 1 <= self.u16(player + 0x200) <= 200:
                    team = self.ptr(self.ptr(person + 0xc8) + 0x10)
                    found[uid] = dict(person=person, player=player, team=team, club=self.ptr(team + 0x30))
        return found

def run(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--ids', default='')
    parser.add_argument('--pid', type=int)
    parser.add_argument('--status', action='store_true')
    parser.add_argument('--happiness', action='store_true')
    args = parser.parse_args(argv)
    ids = list(dict.fromkeys(int(x) for x in args.ids.split(',') if x))
    if len(ids) > (512 if args.happiness else 1024) or any(not 0 < uid < 0xffffffff for uid in ids):
        raise QueryUnavailable('Too many or invalid player IDs in native query.')
    game = Game(args.pid or find_game())
    native = None
    try:
        result = dict(ok=True, pid=game.pid, buyerClubId=game.u32(game.club + 0xc),
                      buyerClub=game.name_entry(game.ptr(game.club + 0xc0)), build=BUILD_SHA,
                      basis='cash-upfront-no-addons', rows=[])
        if args.status:
            try:
                native = InProcessQuery(game)
                native.query_batch([])
            except (InProcessUnavailable, InProcessFailure) as exc:
                raise QueryUnavailable(f'FM in-process query is unavailable: {exc}') from exc
            finally:
                if native:
                    native.close()
                    native = None
            result['calculationMode'] = 'fm-process'
            return result
        players = game.players(ids)
        native_rows = {}
        native_error = None
        eligible_ids = [uid for uid in ids if uid in players and
                        (not args.happiness or players[uid]['club'] == game.club)]
        if eligible_ids:
            try:
                native = InProcessQuery(game)
            except (InProcessUnavailable, InProcessFailure) as exc:
                mode = 'playing-time' if args.happiness else 'transfer'
                raise QueryUnavailable(f'FM in-process {mode} query is unavailable: {exc}') from exc
            for start in range(0, len(eligible_ids), 128):
                batch_ids = eligible_ids[start:start + 128]
                batch = [(uid, players[uid]) for uid in batch_ids]
                try:
                    native_rows.update((row['id'], row) for row in
                                       native.query_batch(batch, happiness=args.happiness))
                except (InProcessFailure, InProcessUnavailable) as exc:
                    native_error = str(exc)
                    break
        result['calculationMode'] = 'fm-process'
        for uid in ids:
            row = dict(id=uid)
            player = players.get(uid)
            if player is None:
                row.update(error='Player is not in the current supported FM database.')
            elif args.happiness and player['club'] != game.club:
                row.update(error='Playing time happiness is available only for your own club.')
            else:
                native_row = native_rows.get(uid)
                if native_row:
                    row.update({key: value for key, value in native_row.items() if key != 'id'})
                elif args.happiness:
                    row['errors'] = {'playingTimeHappiness': native_error or
                                     'FM returned no Playing Time result for this player.'}
                elif native_error:
                    row['errors'] = {'query': native_error}
                else:
                    row['errors'] = {'query': 'FM returned no transfer result for this player.'}
            result['rows'].append(row)
        return result
    finally:
        if native:
            native.close()
        game.close()

if __name__ == '__main__':
    c.WinDLL('kernel32').SetErrorMode(3)
    if '--serve' in sys.argv:
        for line in sys.stdin:
            try:
                request = json.loads(line)
                ids = request.get('ids')
                result = run(['--ids', ','.join(str(uid) for uid in ids)] if ids else ['--status'])
            except Exception as exc:
                result = dict(ok=False, error=str(exc))
            print(json.dumps(result, ensure_ascii=True), flush=True)
    else:
        try:
            print(json.dumps(run(), ensure_ascii=True), flush=True)
        except Exception as exc:
            print(json.dumps(dict(ok=False, error=str(exc))), flush=True)
            sys.exit(1)
