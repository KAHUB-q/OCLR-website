import { APICallError } from "ai";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// The provider may echo user content in its message and arbitrary error fields.
const requestError = z.object({
  error: z.object({
    code: z
      .enum([
        "unsupported_parameter",
        "unsupported_value",
        "invalid_value",
        "missing_required_parameter",
        "context_length_exceeded",
        "model_not_found",
      ])
      .optional()
      .catch(undefined),
    param: z
      .enum([
        "model",
        "messages",
        "stream",
        "max_tokens",
        "max_completion_tokens",
        "stream_options",
      ])
      .optional()
      .catch(undefined),
  }),
});

export function createChatTrace() {
  const requestId = randomUUID();
  const started = Date.now();
  const trace = (
    event: string,
    status?: number,
    details?: { code?: string; param?: string },
  ) => {
    console.info(
      "[liru-chat]",
      JSON.stringify({
        requestId,
        event,
        status,
        ...details,
        durationMs: Date.now() - started,
      }),
    );
  };
  function providerError(error: unknown) {
    if (!APICallError.isInstance(error) || error.statusCode !== 400) return;
    const parsed = requestError.safeParse(error.data);
    if (parsed.success && (parsed.data.error.code || parsed.data.error.param))
      trace("invalid_request", 400, parsed.data.error);
  }
  return { requestId, trace, providerError };
}
