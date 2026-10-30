import { BUFFER_TEXELS } from "../constants";

/** The ink and trauma buffers as half-float bits, exactly as the GPU holds them. */
export interface RawBuffers {
  /** RGBA16F: cumulative ink densities (black, grey 60, grey 30, grey 10). */
  levels: Uint16Array;
  /** R16F: density of all ink, white included. */
  total: Uint16Array;
  /** R16F: trauma. */
  trauma: Uint16Array;
}

export class SnapshotError extends Error {}

const FORMAT_VERSION = 1;
const INK_MAGIC = 0x4b4e4954; // "TINK"
const TRAUMA_MAGIC = 0x4d554154; // "TAUM"
const HEADER_WORDS = 5;

interface Plane {
  channels: number;
  data: Uint16Array;
}

const texels = () => BUFFER_TEXELS.width * BUFFER_TEXELS.height;

/** Expected number of half-floats in each buffer. */
export const LEVELS_HALVES = () => texels() * 4;
export const SINGLE_HALVES = () => texels();

async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Blob> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

async function gunzip(blob: Blob): Promise<ArrayBuffer> {
  try {
    return await new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  } catch {
    throw new SnapshotError("The saved buffer is not a valid gzip file");
  }
}

/** Header (magic, version, width, height, plane count, channels per plane) followed by the planes. */
async function encodePlanes(magic: number, planes: Plane[]): Promise<Blob> {
  const headerBytes = (HEADER_WORDS + planes.length) * 4;
  const bodyBytes = planes.reduce((n, p) => n + p.data.byteLength, 0);
  const bytes = new Uint8Array(headerBytes + bodyBytes);
  const header = new Uint32Array(bytes.buffer, 0, HEADER_WORDS + planes.length);
  header.set([magic, FORMAT_VERSION, BUFFER_TEXELS.width, BUFFER_TEXELS.height, planes.length]);
  planes.forEach((p, i) => (header[HEADER_WORDS + i] = p.channels));
  let offset = headerBytes;
  for (const p of planes) {
    bytes.set(new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.byteLength), offset);
    offset += p.data.byteLength;
  }
  return gzip(bytes);
}

async function decodePlanes(blob: Blob, magic: number, channels: number[]): Promise<Uint16Array[]> {
  const buffer = await gunzip(blob);
  if (buffer.byteLength < HEADER_WORDS * 4) throw new SnapshotError("The saved buffer is truncated");
  const head = new Uint32Array(buffer, 0, HEADER_WORDS);
  if (head[0] !== magic) throw new SnapshotError("Not a saved ink buffer");
  if (head[1] !== FORMAT_VERSION) throw new SnapshotError(`Unsupported buffer format version ${head[1]}`);
  if (head[2] !== BUFFER_TEXELS.width || head[3] !== BUFFER_TEXELS.height) {
    throw new SnapshotError(`The saved buffer is ${head[2]}×${head[3]}, expected ${BUFFER_TEXELS.width}×${BUFFER_TEXELS.height}`);
  }
  if (head[4] !== channels.length) throw new SnapshotError("The saved buffer has the wrong number of planes");
  const headerBytes = (HEADER_WORDS + channels.length) * 4;
  const declared = new Uint32Array(buffer, HEADER_WORDS * 4, channels.length);
  const planes: Uint16Array[] = [];
  let offset = headerBytes;
  for (const [i, c] of channels.entries()) {
    if (declared[i] !== c) throw new SnapshotError("The saved buffer has the wrong channel layout");
    const length = texels() * c;
    if (offset + length * 2 > buffer.byteLength) throw new SnapshotError("The saved buffer is truncated");
    planes.push(new Uint16Array(buffer.slice(offset, offset + length * 2)));
    offset += length * 2;
  }
  if (offset !== buffer.byteLength) throw new SnapshotError("The saved buffer has trailing data");
  return planes;
}

/** ink.bin holds the ink levels and the total ink; trauma.bin the trauma. Both are gzipped. */
export async function encodeBuffers(raw: RawBuffers): Promise<{ ink: Blob; trauma: Blob }> {
  const [ink, trauma] = await Promise.all([
    encodePlanes(INK_MAGIC, [
      { channels: 4, data: raw.levels },
      { channels: 1, data: raw.total },
    ]),
    encodePlanes(TRAUMA_MAGIC, [{ channels: 1, data: raw.trauma }]),
  ]);
  return { ink, trauma };
}

export async function decodeBuffers(ink: Blob, trauma: Blob): Promise<RawBuffers> {
  const [inkPlanes, traumaPlanes] = await Promise.all([
    decodePlanes(ink, INK_MAGIC, [4, 1]),
    decodePlanes(trauma, TRAUMA_MAGIC, [1]),
  ]);
  return { levels: inkPlanes[0]!, total: inkPlanes[1]!, trauma: traumaPlanes[0]! };
}
