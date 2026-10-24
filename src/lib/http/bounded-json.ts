const DEFAULT_MAX_JSON_BODY_BYTES = 16 * 1024;

export type BoundedBytesResult =
  | { bytes: Uint8Array }
  | { tooLarge: true }
  | { invalid: true };

export type BoundedResponseJsonErrorCode = "too-large" | "unavailable" | "invalid-json";

export class BoundedResponseJsonError extends Error {
  constructor(readonly code: BoundedResponseJsonErrorCode) {
    super("Provider response could not be safely parsed");
    this.name = "BoundedResponseJsonError";
  }
}

/** Read a request or response stream with a hard byte ceiling before parsing. */
export async function readBoundedBytes(
  body: ReadableStream<Uint8Array> | null,
  declaredLength: string | null,
  maxBytes: number,
): Promise<BoundedBytesResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer");
  }

  if (declaredLength !== null) {
    const normalizedLength = declaredLength.trim();
    if (!/^\d+$/.test(normalizedLength)) return { invalid: true };
    const length = Number(normalizedLength);
    if (!Number.isSafeInteger(length) || length > maxBytes) return { tooLarge: true };
  }
  if (!body) return { invalid: true };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { tooLarge: true };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes };
  } catch {
    await reader.cancel().catch(() => undefined);
    return { invalid: true };
  } finally {
    reader.releaseLock();
  }
}

export async function readBoundedJson(
  request: Request,
  maxBytes = DEFAULT_MAX_JSON_BODY_BYTES,
): Promise<{ data: unknown } | { tooLarge: true } | null> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return null;

  const result = await readBoundedBytes(
    request.body,
    request.headers.get("content-length"),
    maxBytes,
  );
  if ("tooLarge" in result) return { tooLarge: true };
  if ("invalid" in result) return null;

  try {
    return { data: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(result.bytes)) as unknown };
  } catch {
    return null;
  }
}

export async function readBoundedResponseJson(response: Response, maxBytes: number): Promise<unknown> {
  const result = await readBoundedBytes(
    response.body,
    response.headers.get("content-length"),
    maxBytes,
  );
  if ("tooLarge" in result) throw new BoundedResponseJsonError("too-large");
  if ("invalid" in result) throw new BoundedResponseJsonError("unavailable");

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(result.bytes)) as unknown;
  } catch {
    throw new BoundedResponseJsonError("invalid-json");
  }
}
