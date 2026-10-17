import ctypes as c
from ctypes import wintypes as w
import struct

class ProcessReader:
    def __init__(self, pid):
        self.k = c.WinDLL('kernel32', use_last_error=True)
        self.k.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
        self.k.OpenProcess.restype = w.HANDLE
        self.k.CloseHandle.argtypes = [w.HANDLE]
        self.k.ReadProcessMemory.argtypes = [w.HANDLE, c.c_void_p, c.c_void_p, c.c_size_t, c.POINTER(c.c_size_t)]
        self.h = self.k.OpenProcess(0x410, False, pid)
        if not self.h:
            raise c.WinError(c.get_last_error())
    def close(self):
        self.k.CloseHandle(self.h)
    def read(self, address, size):
        if address < 0x10000 or address + size >= 0x7fffffffffff:
            return None
        buf = (c.c_ubyte * size)()
        n = c.c_size_t()
        if not self.k.ReadProcessMemory(self.h, address, buf, size, c.byref(n)) or n.value != size:
            return None
        return bytes(buf)
    def unpack(self, fmt, address):
        data = self.read(address, struct.calcsize(fmt))
        return struct.unpack(fmt, data)[0] if data else 0
    def ptr(self, address):
        return self.unpack('<Q', address)
    def u32(self, address):
        return self.unpack('<I', address)
    def i32(self, address):
        return self.unpack('<i', address)
    def u16(self, address):
        return self.unpack('<H', address)
    def type_offset(self, person):
        vt = self.ptr(person)
        col = self.ptr(vt - 8)
        return self.u32(col + 4) if col else 0
    def name_entry(self, address):
        for addr in (address, self.ptr(address)):
            text = self.read(addr + 4, 160)
            if text:
                try:
                    result = text.split(b'\0')[0].decode('utf-8').strip()
                    if result and all(ord(x) >= 32 for x in result):
                        return result
                except UnicodeDecodeError:
                    pass
        return ''
    def person_name(self, address):
        common = self.name_entry(self.ptr(address + 0x68))
        return common or ' '.join(filter(None, (self.name_entry(self.ptr(address + 0x58)), self.name_entry(self.ptr(address + 0x60)))))
