import { describe, expect, it } from "vitest";
import {
  blobHasAudioTrack,
  bytesHaveAudioTrack,
  moovHasAudioTrack,
  webmBytesHaveAudio,
} from "@/lib/videoContainerAudio";

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  out.set(u32(out.length), 0);
  out.set(Array.from(type, (ch) => ch.charCodeAt(0)), 4);
  out.set(payload, 8);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function hdlr(handler: string): Uint8Array {
  const payload = new Uint8Array(12);
  payload.set(Array.from(handler, (ch) => ch.charCodeAt(0)), 8);
  return box("hdlr", payload);
}

function moov(handler: string): Uint8Array {
  return box("moov", box("trak", box("mdia", hdlr(handler))));
}

function movie(handler: string): Uint8Array {
  return concat(box("ftyp", new Uint8Array(Array.from("isom", (ch) => ch.charCodeAt(0)))), moov(handler));
}

describe("video container audio", () => {
  it("finds an audio handler inside moov and ignores a preceding mdat", async () => {
    const mdat = box("mdat", new Uint8Array(64));
    const file = concat(mdat, movie("soun"));
    expect(moovHasAudioTrack(moov("soun"))).toBe(true);
    await expect(bytesHaveAudioTrack(file)).resolves.toBe(true);
    const copy = new Uint8Array(file.byteLength);
    copy.set(file);
    await expect(blobHasAudioTrack(new Blob([copy.buffer as ArrayBuffer]))).resolves.toBe(true);
  });

  it("reports a video-only moov as silent", async () => {
    await expect(bytesHaveAudioTrack(movie("vide"))).resolves.toBe(false);
  });

  it("returns null when moov is missing", async () => {
    await expect(bytesHaveAudioTrack(box("ftyp", new Uint8Array(8)))).resolves.toBeNull();
  });

  it("detects WebM audio codecs and video-only WebM", () => {
    const ebml = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
    const withAudio = new Uint8Array(ebml.length + 6);
    withAudio.set(ebml, 0);
    withAudio.set(Array.from("A_OPUS", (ch) => ch.charCodeAt(0)), ebml.length);
    expect(webmBytesHaveAudio(withAudio)).toBe(true);
    const silent = new Uint8Array(ebml.length + 5);
    silent.set(ebml, 0);
    silent.set(Array.from("V_VP9", (ch) => ch.charCodeAt(0)), ebml.length);
    expect(webmBytesHaveAudio(silent)).toBe(false);
  });
});
