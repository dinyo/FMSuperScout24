"""Execute verified FM24 routines on FM's UI thread via a message hook."""
import ctypes as c
from ctypes import wintypes as w
from pathlib import Path
import sys

MAGIC = 0x46534D49
VERSION = 2
MESSAGE_MARKER = 0x46534D51
MAX_PLAYERS = 128
WH_CALLWNDPROC = 4
WM_NULL = 0
SMTO_BLOCK = 1
SMTO_ABORTIFHUNG = 2


class PlayerInput(c.Structure):
    _fields_ = [('id', w.DWORD), ('reserved', w.DWORD),
                ('person', c.c_uint64), ('player', c.c_uint64),
                ('team', c.c_uint64), ('club', c.c_uint64)]


class PlayerResult(c.Structure):
    _fields_ = [('id', w.DWORD), ('errorMask', w.DWORD),
                ('valueStatus', c.c_int32), ('valueMin', c.c_int32), ('valueMax', c.c_int32),
                ('minimumBidStatus', c.c_int32), ('minimumBid', c.c_int32),
                ('interest', c.c_int32), ('loanInterest', c.c_int32),
                ('atAccepted', c.c_int32), ('atUnchanged', c.c_int32), ('atCash', c.c_int32),
                ('belowAccepted', c.c_int32), ('belowUnchanged', c.c_int32), ('belowCash', c.c_int32),
                ('happinessRaw', c.c_int32), ('happinessStatus', c.c_int32), ('happinessError', c.c_int32)]


class Request(c.Structure):
    _fields_ = [('magic', w.DWORD), ('version', w.DWORD), ('count', w.DWORD),
                ('state', c.c_long), ('errorCode', w.DWORD), ('mode', w.DWORD),
                ('base', c.c_uint64), ('manager', c.c_uint64), ('managerPerson', c.c_uint64),
                ('team', c.c_uint64), ('club', c.c_uint64),
                ('buyerClubId', w.DWORD), ('reserved2', w.DWORD),
                ('levels', c.c_int32 * 7),
                ('players', PlayerInput * MAX_PLAYERS),
                ('results', PlayerResult * MAX_PLAYERS),
                ('errorText', c.c_char * 128)]


class InProcessFailure(RuntimeError):
    """An in-process query was sent to FM but did not complete successfully."""


class InProcessUnavailable(RuntimeError):
    """The in-process route could not be prepared before sending a query."""


def _windows_api():
    k = c.WinDLL('kernel32', use_last_error=True)
    u = c.WinDLL('user32', use_last_error=True)
    k.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
    k.OpenProcess.restype = w.HANDLE
    k.VirtualAllocEx.argtypes = [w.HANDLE, c.c_void_p, c.c_size_t, w.DWORD, w.DWORD]
    k.VirtualAllocEx.restype = c.c_void_p
    k.VirtualFreeEx.argtypes = [w.HANDLE, c.c_void_p, c.c_size_t, w.DWORD]
    k.VirtualFreeEx.restype = w.BOOL
    k.WriteProcessMemory.argtypes = [w.HANDLE, c.c_void_p, c.c_void_p, c.c_size_t, c.POINTER(c.c_size_t)]
    k.WriteProcessMemory.restype = w.BOOL
    k.ReadProcessMemory.argtypes = [w.HANDLE, c.c_void_p, c.c_void_p, c.c_size_t, c.POINTER(c.c_size_t)]
    k.ReadProcessMemory.restype = w.BOOL
    k.CloseHandle.argtypes = [w.HANDLE]
    k.CloseHandle.restype = w.BOOL
    k.LoadLibraryW.argtypes = [w.LPCWSTR]
    k.LoadLibraryW.restype = w.HMODULE
    k.GetProcAddress.argtypes = [w.HMODULE, c.c_char_p]
    k.GetProcAddress.restype = c.c_void_p
    k.FreeLibrary.argtypes = [w.HMODULE]
    k.FreeLibrary.restype = w.BOOL
    k.OpenThread.argtypes = [w.DWORD, w.BOOL, w.DWORD]
    k.OpenThread.restype = w.HANDLE

    u.EnumWindows.argtypes = [c.c_void_p, w.LPARAM]
    u.EnumWindows.restype = w.BOOL
    u.GetWindowThreadProcessId.argtypes = [w.HWND, c.POINTER(w.DWORD)]
    u.GetWindowThreadProcessId.restype = w.DWORD
    u.IsWindowVisible.argtypes = [w.HWND]
    u.IsWindowVisible.restype = w.BOOL
    u.GetWindowTextW.argtypes = [w.HWND, w.LPWSTR, c.c_int]
    u.GetWindowTextW.restype = c.c_int
    u.SetWindowsHookExW.argtypes = [c.c_int, c.c_void_p, w.HINSTANCE, w.DWORD]
    u.SetWindowsHookExW.restype = w.HANDLE
    u.UnhookWindowsHookEx.argtypes = [w.HANDLE]
    u.UnhookWindowsHookEx.restype = w.BOOL
    u.SendMessageTimeoutW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM,
                                      w.UINT, w.UINT, c.POINTER(c.c_size_t)]
    u.SendMessageTimeoutW.restype = c.c_ssize_t
    return k, u


def _visible_game_window(user32, pid):
    windows = []
    callback_type = c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)

    @callback_type
    def visit(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        owner_pid = w.DWORD()
        tid = user32.GetWindowThreadProcessId(hwnd, c.byref(owner_pid))
        if owner_pid.value != pid or not tid:
            return True
        title = c.create_unicode_buffer(512)
        user32.GetWindowTextW(hwnd, title, len(title))
        windows.append((('football manager 2024' in title.value.casefold()), hwnd, tid, title.value))
        return True

    user32.EnumWindows(visit, 0)
    preferred = [item for item in windows if item[0]]
    choices = preferred or windows
    if not choices:
        raise InProcessUnavailable('The running FM24 process has no visible game window to receive the query.')
    _, hwnd, tid, title = choices[0]
    return hwnd, tid, title


def _thread_teb(kernel32, tid):
    thread = kernel32.OpenThread(0x40, False, tid)
    if not thread:
        raise InProcessUnavailable('FM window thread information is unavailable.')
    class BasicInfo(c.Structure):
        _fields_ = [('exit', c.c_long), ('teb', c.c_void_p), ('pid', c.c_void_p),
                    ('tid', c.c_void_p), ('affinity', c.c_size_t),
                    ('priority', c.c_long), ('base_priority', c.c_long)]
    nt = c.WinDLL('ntdll')
    nt.NtQueryInformationThread.argtypes = [w.HANDLE, c.c_ulong, c.c_void_p, c.c_ulong, c.c_void_p]
    try:
        info = BasicInfo()
        if nt.NtQueryInformationThread(thread, 0, c.byref(info), c.sizeof(info), None) != 0:
            raise InProcessUnavailable('FM window thread TEB could not be read.')
        return info.teb
    finally:
        kernel32.CloseHandle(thread)


class InProcessQuery:
    def __init__(self, game):
        self.game = game
        if c.sizeof(c.c_void_p) != 8:
            raise InProcessUnavailable('The FM24 in-process query requires a 64-bit worker.')
        self.kernel32, self.user32 = _windows_api()
        self.process = None
        self.module = None
        self.hook = None
        self.remote = None
        self._abandoned = False

        try:
            hwnd, self.thread_id, self.window_title = _visible_game_window(self.user32, game.pid)
            self.hwnd = hwnd
            window_teb = _thread_teb(self.kernel32, self.thread_id)
            if int(window_teb or 0) != int(game.teb or 0):
                raise InProcessUnavailable('FM window is not on the game thread required by the verified routines.')

            dll = self._dll_path()
            if not dll.is_file():
                raise InProcessUnavailable('The FM24 in-process hook DLL is not installed.')
            self.process = self.kernel32.OpenProcess(0x400 | 0x008 | 0x010 | 0x020, False, game.pid)
            if not self.process:
                raise InProcessUnavailable(f'FM process access failed ({c.get_last_error()}).')
            self.module = self.kernel32.LoadLibraryW(str(dll))
            if not self.module:
                raise InProcessUnavailable(f'The in-process hook DLL could not be loaded ({c.get_last_error()}).')
            procedure = self.kernel32.GetProcAddress(self.module, b'FMSS_CwpHook')
            if not procedure:
                raise InProcessUnavailable('The FM24 in-process hook entry point is missing.')
            self.hook = self.user32.SetWindowsHookExW(WH_CALLWNDPROC, procedure, self.module, self.thread_id)
            if not self.hook:
                raise InProcessUnavailable(f'The FM UI-thread hook could not be installed ({c.get_last_error()}).')
            self.remote = self.kernel32.VirtualAllocEx(self.process, None, c.sizeof(Request), 0x3000, 0x04)
            if not self.remote:
                raise InProcessUnavailable(f'FM query memory could not be allocated ({c.get_last_error()}).')
        except Exception:
            self.close()
            raise

    @staticmethod
    def _dll_path():
        if getattr(sys, 'frozen', False):
            return Path(sys.executable).resolve().parent / 'FMSuperScout24.FM24Hook.dll'
        return Path(__file__).resolve().parent.parent / 'bin' / 'native-query' / 'FMSuperScout24.FM24Hook.dll'

    def _request(self, players, happiness=False):
        if len(players) > MAX_PLAYERS:
            raise InProcessUnavailable(f'In-process batches are limited to {MAX_PLAYERS} players.')
        game = self.game
        request = Request()
        request.magic = MAGIC
        request.version = VERSION
        request.count = len(players)
        request.mode = 1 if happiness else 0
        request.state = 1
        request.base = int(game.base)
        request.manager = int(game.manager)
        request.managerPerson = int(game.manager_person)
        request.team = int(game.team)
        request.club = int(game.club)
        request.buyerClubId = game.u32(game.club + 0xc)
        for i, level in enumerate(game.levels):
            request.levels[i] = level
        for i, (uid, player) in enumerate(players):
            request.players[i] = PlayerInput(uid, 0, player['person'], player['player'], player['team'], player['club'])
        return request

    def _send(self, request):
        size = c.sizeof(request)
        payload = (c.c_ubyte * size).from_buffer_copy(c.string_at(c.byref(request), size))
        written = c.c_size_t()
        if not self.kernel32.WriteProcessMemory(self.process, self.remote, c.byref(payload), size, c.byref(written)) or written.value != size:
            raise InProcessUnavailable(f'The FM query request could not be written ({c.get_last_error()}).')
        response = c.c_size_t()
        delivered = self.user32.SendMessageTimeoutW(self.hwnd, WM_NULL, MESSAGE_MARKER,
                                                    int(self.remote), SMTO_BLOCK | SMTO_ABORTIFHUNG,
                                                    120000, c.byref(response))
        if not delivered:
            self._abandoned = True
            raise InProcessFailure(f'FM did not finish the in-process query ({c.get_last_error()}); its temporary buffer was left allocated for safety.')
        buffer = c.create_string_buffer(size)
        read = c.c_size_t()
        if not self.kernel32.ReadProcessMemory(self.process, self.remote, buffer, size, c.byref(read)) or read.value != size:
            raise InProcessFailure(f'The in-process FM result could not be read ({c.get_last_error()}).')
        result = Request.from_buffer_copy(buffer.raw)
        if result.state != 2:
            detail = bytes(result.errorText).split(b'\0', 1)[0].decode('utf-8', 'replace')
            raise InProcessFailure(f'{detail} (code {result.errorCode})' if detail
                                   else f'FM returned in-process error {result.errorCode}.')
        return result

    @staticmethod
    def _interest(value):
        if value == -2:
            return 'Not interested'
        if value < 0:
            return None
        levels = ('Doubtful', 'Unsure', 'Slightly Interested', 'Interested', 'Very Interested', 'Extremely Interested')
        return levels[value] if value < len(levels) else None

    def query_batch(self, players, happiness=False):
        result = self._send(self._request(players, happiness))
        rows = []
        if happiness:
            labels = {-5: 'Delighted', -4: 'Very Happy', -3: 'Happy', -2: 'Dissatisfied',
                      0: 'Satisfied', 1: 'Concerned'}
            errors_by_code = {
                1: 'Player has no current Playing Time contract.',
                2: 'Player contract does not support Playing Time happiness.',
                3: 'Invalid Playing Time raw score.',
                4: 'Invalid Playing Time concern-history ring.',
                5: 'FM returned an unmapped Playing Time status.',
                6: 'FM raised an exception while evaluating Playing Time happiness.',
            }
            for index, (uid, _) in enumerate(players):
                item = result.results[index]
                row = dict(id=uid)
                if item.errorMask & 0xc0000000:
                    row['error'] = 'FM could not safely evaluate this player.'
                elif item.errorMask & 0x10:
                    row['errors'] = {'playingTimeHappiness': errors_by_code.get(
                        item.happinessError, 'FM could not complete the Playing Time calculation.')}
                else:
                    label = labels.get(item.happinessStatus)
                    if label is None or not -100 <= item.happinessRaw <= 100:
                        row['errors'] = {'playingTimeHappiness': 'FM returned an invalid Playing Time result.'}
                    else:
                        row.update(playingTimeHappiness=item.happinessRaw,
                                   playingTimeHappinessStatus=label,
                                   playingTimeHappinessSource='native-calculation')
                rows.append(row)
            return rows
        names = ((1, 'value'), (2, 'minimumBid'), (4, 'transferInterest'), (8, 'loanInterest'))
        bid_status = {-1: 'not-applicable', 0: 'unavailable', 1: 'verified-cash-boundary', 2: 'boundary-not-verified'}
        for index, (uid, _) in enumerate(players):
            item = result.results[index]
            row = dict(id=uid)
            errors = {name: 'FM could not complete the in-process calculation.' for bit, name in names if item.errorMask & bit}
            if item.errorMask & 0xc0000000:
                row['error'] = ('Player pointer no longer matches the requested FM player.'
                                if item.errorMask & 0x80000000 else
                                'FM raised an exception while evaluating this player.')
                rows.append(row)
                continue
            if item.errorMask & 1:
                errors['value'] = (f'FM value routine raised exception 0x{item.valueStatus & 0xffffffff:08x} '
                                   f'at 0x{item.valueMin & 0xffffffff:08x} accessing 0x{item.valueMax & 0xffffffff:08x}.')
            if item.errorMask & 2:
                stage, code = {
                    3: ('offer evaluation at the asking price', item.atCash),
                    4: ('offer evaluation below the asking price', item.belowCash),
                    5: ('minimum-bid calculation', item.minimumBid),
                }.get(item.minimumBidStatus, ('minimum-bid calculation', 0))
                errors['minimumBid'] = f'FM {stage} raised exception 0x{code & 0xffffffff:08x}.'
            if not item.errorMask & 1:
                row.update(fmValueRead=True, valueMin=item.valueMin if item.valueMin >= 0 else None,
                           valueMax=item.valueMax if item.valueMax >= 0 else None,
                           valueStatus=item.valueStatus)
            if not item.errorMask & 2:
                status = bid_status.get(item.minimumBidStatus, 'unavailable')
                row.update(minimumAcceptedBid=item.minimumBid if item.minimumBidStatus == 1 else None,
                           minimumBidStatus=status)
                if item.minimumBidStatus == 1:
                    row['minimumBidProof'] = dict(
                        at=dict(accepted=bool(item.atAccepted), unchanged=bool(item.atUnchanged), cash=item.atCash),
                        below=(dict(accepted=bool(item.belowAccepted), unchanged=bool(item.belowUnchanged), cash=item.belowCash)
                               if item.minimumBid else None))
            if not item.errorMask & 4:
                row['gameInterest'] = self._interest(item.interest)
            if not item.errorMask & 8:
                row['gameLoanInterest'] = self._interest(item.loanInterest)
            if errors:
                row['errors'] = errors
            rows.append(row)
        return rows

    def close(self):
        if self._abandoned:
            # FM may still be executing this buffer after the caller timed out.
            return
        if self.hook:
            self.user32.UnhookWindowsHookEx(self.hook)
            self.hook = None
        if self.remote and self.process:
            self.kernel32.VirtualFreeEx(self.process, self.remote, 0, 0x8000)
            self.remote = None
        if self.module:
            self.kernel32.FreeLibrary(self.module)
            self.module = None
        if self.process:
            self.kernel32.CloseHandle(self.process)
            self.process = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()
