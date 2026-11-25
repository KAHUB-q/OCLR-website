import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ChatConfiguration } from "./chat-config";
import { safeChatError, type ChatTrace } from "./chat-trace";
import { chatProxyFetch } from "./chat-proxy";

export function chatProvider(
  config: ChatConfiguration,
  trace?: ChatTrace["trace"],
) {
  const send = chatProxyFetch(config.proxyURL) ?? fetch;
  return createOpenAICompatible({
    name: "oclr",
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    transformRequestBody:
      new URL(config.baseURL).hostname === "api.openai.com"
        ? ({ max_tokens, ...body }) => ({
            ...body,
            max_completion_tokens: max_tokens,
          })
        : undefined,
    fetch: async (input, init) => {
      if (!trace) return send(input, init);
      const started = performance.now();
      trace("upstream_start", undefined, {
        providerHost: new URL(config.baseURL).hostname,
        viaProxy: Boolean(config.proxyURL),
      });
      try {
        const response = await send(input, init);
        const mime = response.headers.get("content-type") ?? "";
        const responseFormat = mime.startsWith("text/event-stream")
          ? "event-stream"
          : mime.startsWith("application/json")
            ? "json"
            : mime
              ? "other"
              : "missing";
        trace("upstream_http", response.status, {
          responseFormat,
          headerMs: Math.round(performance.now() - started),
        });
        return response;
      } catch (error) {
        trace("upstream_transport_error", undefined, {
          ...safeChatError(error),
          aborted: init?.signal?.aborted ?? false,
        });
        throw error;
      }
    },
  });
}
