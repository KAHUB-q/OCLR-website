import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ChatConfiguration } from "./chat-config";
import { chatProxyFetch } from "./chat-proxy";

export function chatProvider(
  config: ChatConfiguration,
  trace?: (event: "upstream_start" | "upstream_http", status?: number) => void,
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
      trace?.("upstream_start");
      const response = await send(input, init);
      trace?.("upstream_http", response.status);
      return response;
    },
  });
}
