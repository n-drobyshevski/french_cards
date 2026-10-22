// Upload limits and magic-byte sniffing for /api/ai/extract.

export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
/**
 * Whole request body. Matches the 4.5 MB request cap of Vercel functions, so the route answers
 * with its own JSON 413; the client keeps all tiles under 4 MiB (lib/image-prep.ts MAX_TOTAL_BYTES).
 */
export const MAX_EXTRACT_BODY_BYTES = 4_500_000;

export type ImageType = "image/png" | "image/jpeg" | "image/webp";

const startsWith = (bytes: Uint8Array, sig: readonly number[], offset = 0) =>
  bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);

/** Media type from the file's magic bytes (the declared type is never trusted). */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/**
 * Reads a request body, giving up as soon as it passes `limit` bytes. Content-Length is
 * checked first when present, but chunked bodies or a lying header are counted while read,
 * so nothing past the limit is ever buffered. Returns null when the body is too large.
 */
export async function readBodyWithLimit(req: Request, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const header = req.headers.get("content-length");
  if (header !== null) {
    const declared = Number(header);
    if (Number.isFinite(declared) && declared > limit) return null;
  }
  if (!req.body) return new Uint8Array(0);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
