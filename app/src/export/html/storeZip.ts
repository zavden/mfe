/* A zip archive of files, stored as they are: no compression, no ZIP64, no data descriptors
 * (PKWARE APPNOTE 6.3.10: §4.3.7 the local file header, §4.3.12 the central directory header,
 * §4.3.16 the end of the central directory, §4.4.4 bit 11 names in UTF-8, §4.4.7 CRC-32). What
 * Export ▸ HTML downloads where the browser cannot write a folder. The files are text and small:
 * a deflate of its own would save little and be a compressor to keep right. Pure. */

export interface ZipEntry {
  /** The path inside the archive, `/` between folders. */
  path: string;
  bytes: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A date as a zip keeps it: local time, to two seconds, from 1980 on. */
function dosDateTime(when: Date): { time: number; date: number } {
  const year = Math.min(Math.max(when.getFullYear(), 1980), 2107);
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

/** The archive of `entries`, in their order, each dated `when`. Throws for what needs ZIP64 (a
 * file or an archive of 4 GiB, 65 535 files) and for a path a zip cannot hold. */
export function storeZip(
  entries: readonly ZipEntry[],
  when: Date = new Date(),
): Uint8Array<ArrayBuffer> {
  if (entries.length > 0xfffe) throw new Error('A zip of this kind holds at most 65 534 files.');
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(when);
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (entry.path === '' || entry.path.startsWith('/') || entry.path.includes('\\')) {
      throw new Error(`"${entry.path}" is not a path a zip can hold.`);
    }
    const name = encoder.encode(entry.path);
    const size = entry.bytes.length;
    if (size > 0xfffffffe || offset > 0xfffffffe) {
      throw new Error('A zip of this kind holds less than 4 GiB.');
    }
    const crc = crc32(entry.bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header
    local.setUint16(4, 20, true); // version needed to extract: 2.0
    local.setUint16(6, 0x0800, true); // names in UTF-8
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, entry.bytes);
    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true); // central directory header
    header.setUint16(4, 20, true); // made by: 2.0, MS-DOS
    header.setUint16(6, 20, true);
    header.setUint16(8, 0x0800, true);
    header.setUint16(10, 0, true);
    header.setUint16(12, time, true);
    header.setUint16(14, date, true);
    header.setUint32(16, crc, true);
    header.setUint32(20, size, true);
    header.setUint32(24, size, true);
    header.setUint16(28, name.length, true);
    header.setUint32(42, offset, true); // where its local header is
    central.push(new Uint8Array(header.buffer), name);
    offset += 30 + name.length + size;
  }
  const directory = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of the central directory
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, directory, true);
  end.setUint32(16, offset, true);
  const out = new Uint8Array(offset + directory + 22);
  let at = 0;
  for (const part of [...parts, ...central, new Uint8Array(end.buffer)]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
