import "server-only";
export async function boundedRequest(request: Request, limit = 20000) {
  if (Number(request.headers.get("content-length") ?? 0) > limit) throw new Response("Request too large", { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) throw new Response("Request body required", { status: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Response("Request too large", { status: 413 }); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new Request(request.url, { method: request.method, headers: request.headers, body: Buffer.concat(chunks) });
}
