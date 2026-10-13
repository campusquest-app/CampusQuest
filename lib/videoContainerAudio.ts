/**
 * Detect an audio track from the container, without decoding or re-encoding.
 * ISO BMFF (MP4/MOV/M4V) is walked by box size so media bytes are skipped.
 * `null` means the container was incomplete or unrecognized — not "silent".
 */

const ISO_CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "edts", "udta", "mvex"]);
const WEBM_AUDIO = ["A_OPUS", "A_VORBIS", "A_AAC", "A_FLAC", "A_PCM/INT/LIT", "A_PCM/FLOAT/IEEE", "A_MS/ACM"];
const WEBM_VIDEO = ["V_VP8", "V_VP9", "V_AV1", "V_MPEG4/ISO/AVC", "V_THEORA"];
const MAX_BOXES = 20_000;

export type ByteReader = {
  size: number;
  read(start: number, end: number): Promise<Uint8Array>;
};

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
  );
}

function fourcc(bytes: Uint8Array, offset: number): string {
  if (offset + 4 > bytes.length) return "";
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
}

function readBoxHeader(
  bytes: Uint8Array,
  parentRemaining: number,
): { size: number; type: string; headerLen: number } | null {
  if (bytes.length < 8 || parentRemaining < 8) return null;
  let size = readU32(bytes, 0);
  const type = fourcc(bytes, 4);
  if (!/^[ -~]{4}$/.test(type)) return null;
  let headerLen = 8;
  if (size === 1) {
    if (bytes.length < 16) return null;
    const hi = readU32(bytes, 8);
    const lo = readU32(bytes, 12);
    if (hi > 0) return null;
    size = lo;
    headerLen = 16;
  } else if (size === 0) {
    size = parentRemaining;
  }
  if (size < headerLen || size > parentRemaining) return null;
  return { size, type, headerLen };
}

function handlerIsAudio(box: Uint8Array): boolean {
  // ISO BMFF handler_type is at offset 16. Classic QuickTime subtype is at offset 12.
  return fourcc(box, 16) === "soun" || fourcc(box, 12) === "soun";
}

/** True when a complete `moov` box (header included) contains an audio track. */
export function moovHasAudioTrack(moov: Uint8Array): boolean {
  return walkForAudio(moov, 8, moov.length, { count: 0 });
}

function walkForAudio(buf: Uint8Array, start: number, end: number, guard: { count: number }): boolean {
  let offset = start;
  while (offset + 8 <= end) {
    guard.count += 1;
    if (guard.count > MAX_BOXES) return false;
    const header = readBoxHeader(buf.subarray(offset, Math.min(end, offset + 16)), end - offset);
    if (!header) return false;
    const boxEnd = offset + header.size;
    if (header.type === "hdlr" && handlerIsAudio(buf.subarray(offset, boxEnd))) return true;
    if (ISO_CONTAINERS.has(header.type)) {
      if (walkForAudio(buf, offset + header.headerLen, boxEnd, guard)) return true;
    }
    offset = boxEnd;
  }
  return false;
}

function isWebm(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

function includesAscii(bytes: Uint8Array, needle: string): boolean {
  const n = needle.length;
  if (bytes.length < n) return false;
  const codes = Array.from(needle, (ch) => ch.charCodeAt(0));
  for (let i = 0; i <= bytes.length - n; i += 1) {
    let match = true;
    for (let j = 0; j < n; j += 1) {
      if (bytes[i + j] !== codes[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

export function webmBytesHaveAudio(bytes: Uint8Array): boolean | null {
  if (!isWebm(bytes) && !WEBM_VIDEO.some((id) => includesAscii(bytes, id)) && !WEBM_AUDIO.some((id) => includesAscii(bytes, id))) {
    return null;
  }
  if (WEBM_AUDIO.some((id) => includesAscii(bytes, id))) return true;
  if (WEBM_VIDEO.some((id) => includesAscii(bytes, id))) return false;
  return null;
}

/** Walk top-level ISO boxes. Returns null when `moov` is missing or truncated. */
export async function isoReaderHasAudio(reader: ByteReader): Promise<boolean | null> {
  let offset = 0;
  let boxes = 0;
  while (offset + 8 <= reader.size) {
    boxes += 1;
    if (boxes > MAX_BOXES) return null;
    const headerBytes = await reader.read(offset, Math.min(reader.size, offset + 16));
    const header = readBoxHeader(headerBytes, reader.size - offset);
    if (!header) return null;
    if (header.type === "moov") {
      const moov = await reader.read(offset, offset + header.size);
      if (moov.length < header.size) return null;
      return moovHasAudioTrack(moov);
    }
    offset += header.size;
  }
  return null;
}

function memoryReader(bytes: Uint8Array): ByteReader {
  return {
    size: bytes.length,
    read: async (start, end) => bytes.subarray(start, Math.min(end, bytes.length)),
  };
}

export async function bytesHaveAudioTrack(bytes: Uint8Array): Promise<boolean | null> {
  if (bytes.length < 12) return null;
  if (isWebm(bytes)) return webmBytesHaveAudio(bytes);
  return isoReaderHasAudio(memoryReader(bytes));
}

export async function blobHasAudioTrack(blob: Blob): Promise<boolean | null> {
  if (blob.size < 12) return null;
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (isWebm(head)) {
    const windows = [await blob.slice(0, Math.min(blob.size, 2 * 1024 * 1024)).arrayBuffer()];
    if (blob.size > 2 * 1024 * 1024) {
      windows.push(await blob.slice(Math.max(0, blob.size - 256 * 1024), blob.size).arrayBuffer());
    }
    const combined = new Uint8Array(windows.reduce((sum, buf) => sum + buf.byteLength, 0));
    let offset = 0;
    for (const buf of windows) {
      combined.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }
    return webmBytesHaveAudio(combined);
  }
  return isoReaderHasAudio({
    size: blob.size,
    read: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()),
  });
}

const remoteCache = new Map<string, Promise<boolean | null>>();

function contentRangeTotal(header: string | null): number | null {
  const match = header ? /\/(\d+)\s*$/.exec(header) : null;
  if (!match) return null;
  const total = Number(match[1]);
  return Number.isFinite(total) && total > 0 ? total : null;
}

async function fetchRange(
  url: string,
  start: number,
  end: number,
): Promise<{ bytes: Uint8Array; total: number | null; entire: boolean } | null> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const length = Number(response.headers.get("content-length") || 0);
  if (response.status === 200 && length > 8 * 1024 * 1024) {
    await response.body?.cancel();
    return null;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const total = contentRangeTotal(response.headers.get("content-range")) ?? (response.status === 200 ? bytes.length : null);
  return { bytes, total, entire: response.status === 200 };
}

/** Range-read a stored video URL and report whether its container has an audio track. */
export function sniffVideoHasAudioFromUrl(url: string): Promise<boolean | null> {
  const cached = remoteCache.get(url);
  if (cached) return cached;
  const pending = sniffRemote(url)
    .catch(() => null)
    .then((result) => {
      if (result == null) remoteCache.delete(url);
      return result;
    });
  remoteCache.set(url, pending);
  return pending;
}

async function sniffRemote(url: string): Promise<boolean | null> {
  const first = await fetchRange(url, 0, 15);
  if (!first || first.bytes.length < 12 || first.total == null) return null;
  if (first.entire) return bytesHaveAudioTrack(first.bytes);
  if (isWebm(first.bytes)) {
    const head = await fetchRange(url, 0, Math.min(first.total - 1, 2 * 1024 * 1024 - 1));
    if (!head) return null;
    return webmBytesHaveAudio(head.bytes);
  }
  return isoReaderHasAudio({
    size: first.total,
    read: async (start, end) => {
      const chunk = await fetchRange(url, start, Math.max(start, end - 1));
      return chunk?.bytes ?? new Uint8Array();
    },
  });
}
