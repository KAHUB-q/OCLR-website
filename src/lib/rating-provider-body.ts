// Count the decoded response stream even when Content-Length is missing or describes compressed bytes.
export async function readRatingBody<T>(
  response: Response,
  parse: (text: string) => T,
): Promise<T> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing rating response.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 64 * 1024) throw new Error("Oversized rating response.");
      text += decoder.decode(part.value, { stream: true });
    }
    return parse(text + decoder.decode());
  } catch {
    void reader.cancel().catch(() => {});
    throw new Error("Invalid rating response body.");
  } finally {
    reader.releaseLock();
  }
}
