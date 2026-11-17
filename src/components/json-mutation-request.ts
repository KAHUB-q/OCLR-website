export async function jsonMutationRequest(
  url: string,
  payload: Record<string, unknown>,
  compress = false,
) {
  const json = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  let body: Blob | string = json;
  if (compress && typeof CompressionStream !== "undefined") {
    headers["Content-Encoding"] = "gzip";
    const gzip = new Blob([json])
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    body = await new Response(gzip).blob();
  }
  return fetch(url, { method: "POST", headers, body });
}
