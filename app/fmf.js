'use strict';

// FM24 shortlist archive writer. FM24 only lists the version-8 archive in its
// import dialog; Genie Scout's older v7 output may be silently ignored.
const crypto = require('crypto');
const zlib = require('zlib');

const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const str = s => { const b = Buffer.from(String(s), 'utf8'); return Buffer.concat([u32(b.length), b]); };

function encryptedMember(plain) {
  const key = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const packed = zlib.zstdCompressSync(plain);
  const cipher = crypto.createCipheriv('aes-128-ctr', key, iv);
  return Buffer.concat([u32(16), u32(16), key, iv, cipher.update(packed), cipher.final()]);
}

function slf(name, ids) {
  // 0x008cd257 is FM24's shortlist database signature (as written by GS26).
  const sig = Buffer.alloc(4); sig.writeUInt32LE(0x008cd257);
  const list = Buffer.alloc(ids.length * 4);
  ids.forEach((id, i) => list.writeUInt32LE(id >>> 0, i * 4));
  return Buffer.concat([
    Buffer.from([3, 1, 0x66, 0x6c, 0x73, 0x2e, 2, 0, 1]),
    sig, str(name), u32(ids.length), list, Buffer.from([0]),
  ]);
}

function details(name) {
  return Buffer.concat([
    Buffer.from([3, 1, 0x6d, 0x6f, 0x61, 0x2e, 4, 0]),
    str('PLAYER_SHORTLIST_TYPE_HANDLER'), str(name),
    Buffer.alloc(10), Buffer.alloc(16, 0xff), str('Player'),
    Buffer.from([1, 0, 1, 0, 2, 0xba, 0x56, 0, 0, 1, 0, 0x10, 1]),
  ]);
}

// Exact neutral thumbnail payload used by FM24 itself.
const THUMB = Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

function manifest(name, members) {
  const stamp = Buffer.from('00096e88f1ffffff', 'hex');
  const entry = (parts, m) => Buffer.concat([
    ...parts.map(str), u64(m.offset), u64(m.data.length), u64(m.plain.length),
    stamp, stamp,
  ]);
  return Buffer.concat([
    str(name), u32(2),
    entry(['image', '.img'], members[1]),
    entry([name, '.slf'], members[2]),
    u32(1), str('_data'), u32(1), entry(['details', '.aom'], members[0]),
    u32(0),
  ]);
}

function createShortlistFmf(name, inputIds) {
  name = String(name || 'FMSuperScout 24').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || 'FMSuperScout 24';
  const ids = [...new Set((inputIds || []).map(Number).filter(Number.isInteger).filter(n => n > 0 && n <= 0xffffffff))];
  if (!ids.length) throw new Error('shortlist is empty');
  // FM24 writes the internal metadata first, then image, then shortlist.
  const plains = [details(name), THUMB, slf(name, ids)];
  let offset = 0;
  const members = plains.map(plain => {
    const data = encryptedMember(plain);
    const m = { plain, data, offset }; offset += data.length; return m;
  });
  const body = Buffer.concat(members.map(m => m.data));
  const outer = Buffer.concat([
    Buffer.from([2, 1, 0x61, 0x66, 0x65, 0x2e, 8, 0, 0]),
    // v8 outer remainder, byte-exact against FM24's own (Default).fmf:
    // four zeroes, 0x11, seven zeroes, then 0x03.
    u32(body.length + 17), Buffer.from([0, 0, 0, 0, 0x11]), Buffer.alloc(7), Buffer.from([3]),
  ]);
  const index = zlib.zstdCompressSync(manifest(name, members));
  return { name, ids, data: Buffer.concat([outer, body, Buffer.from([2, 1, 0x66, 0x6d, 0x66, 0x2e, 8, 0, 0]), index]) };
}

function readText(buf, cursor) {
  if (cursor.pos + 4 > buf.length) throw new Error('manifest terpotong');
  const n = buf.readUInt32LE(cursor.pos); cursor.pos += 4;
  if (n > 1024 * 1024 || cursor.pos + n > buf.length) throw new Error('string manifest tidak valid');
  const value = buf.subarray(cursor.pos, cursor.pos + n).toString('utf8'); cursor.pos += n;
  return value;
}

function parseManifest(buf) {
  const c = { pos: 0 };
  const title = readText(buf, c);
  const members = [];
  const entries = count => {
    for (let i = 0; i < count; i++) {
      const parts = [];
      for (;;) {
        const part = readText(buf, c); parts.push(part);
        if (part.startsWith('.')) break;
        if (parts.length > 16) throw new Error('pad manifest tidak valid');
      }
      if (c.pos + 40 > buf.length) throw new Error('entry manifest terpotong');
      const offset = Number(buf.readBigUInt64LE(c.pos)); c.pos += 8;
      const stored = Number(buf.readBigUInt64LE(c.pos)); c.pos += 8;
      const plain = Number(buf.readBigUInt64LE(c.pos)); c.pos += 8;
      c.pos += 16;
      members.push({ parts, offset, stored, plain });
    }
  };
  if (c.pos + 4 > buf.length) throw new Error('manifest tidak lengkap');
  const regular = buf.readUInt32LE(c.pos); c.pos += 4; entries(regular);
  // Internal members form a small directory tree (`_data` -> details.aom),
  // unlike the flat regular-member section above.
  if (c.pos + 4 <= buf.length) {
    const roots = buf.readUInt32LE(c.pos); c.pos += 4;
    for (let r = 0; r < roots; r++) {
      const root = readText(buf, c);
      if (c.pos + 4 > buf.length) throw new Error('tree manifest terpotong');
      const children = buf.readUInt32LE(c.pos); c.pos += 4;
      const before = members.length;
      entries(children);
      for (let i = before; i < members.length; i++) members[i].parts.unshift(root);
    }
  }
  return { title, members };
}

function importShortlistFmf(file) {
  if (!Buffer.isBuffer(file) || file.length < 64) throw new Error('file FMF terlalu kecil');
  if (file.subarray(0, 2).toString('hex') !== '0201' || file.subarray(2, 6).toString('ascii') !== 'afe.')
    throw new Error('bukan archive shortlist FMF');
  const version = file[6];
  if (version !== 7 && version !== 8) throw new Error(`versi FMF ${version} belum didukung`);
  const marker = Buffer.from([2, 1, 0x66, 0x6d, 0x66, 0x2e, version, 0, 0]);
  const inner = file.lastIndexOf(marker);
  if (inner < 26) throw new Error('manifest FMF tidak ditemukan');
  let manifestPacked = file.subarray(inner + 9);
  const manifest = parseManifest(version === 8
    ? zlib.zstdDecompressSync(manifestPacked)
    : zlib.inflateSync(manifestPacked));
  const slfEntry = manifest.members.find(m => m.parts.at(-1) === '.slf');
  if (!slfEntry || slfEntry.offset < 0 || slfEntry.stored < 40 || 26 + slfEntry.offset + slfEntry.stored > inner)
    throw new Error('payload shortlist .slf tidak ditemukan');
  const start = 26 + slfEntry.offset;
  if (file.readUInt32LE(start) !== 16 || file.readUInt32LE(start + 4) !== 16)
    throw new Error('header enkripsi shortlist tidak valid');
  const key = file.subarray(start + 8, start + 24);
  const iv = file.subarray(start + 24, start + 40);
  const decipher = crypto.createDecipheriv('aes-128-ctr', key, iv);
  let payload = Buffer.concat([
    decipher.update(file.subarray(start + 40, start + slfEntry.stored)), decipher.final(),
  ]);
  // FM's own v8 exports store the .slf bytes directly inside AES-CTR. Our earlier
  // writer compressed them first, so accept both representations for compatibility.
  if (version === 8 && payload.subarray(0, 4).equals(Buffer.from([0x28, 0xb5, 0x2f, 0xfd])))
    payload = zlib.zstdDecompressSync(payload);
  if (payload.length < 18 || payload.subarray(0, 6).toString('hex') !== '0301666c732e')
    throw new Error('payload .slf tidak valid');
  let p = 13;
  const nameLength = payload.readUInt32LE(p); p += 4;
  if (nameLength > 4096 || p + nameLength + 4 > payload.length) throw new Error('nama shortlist tidak valid');
  const name = payload.subarray(p, p + nameLength).toString('utf8'); p += nameLength;
  const count = payload.readUInt32LE(p); p += 4;
  if (count > 500000 || p + count * 4 > payload.length) throw new Error('jumlah pemain tidak valid');
  const ids = new Array(count);
  for (let i = 0; i < count; i++) ids[i] = payload.readUInt32LE(p + i * 4);
  return { name: name || manifest.title, ids: [...new Set(ids.filter(id => id && id !== 0xffffffff))], version };
}

module.exports = { createShortlistFmf, importShortlistFmf };
