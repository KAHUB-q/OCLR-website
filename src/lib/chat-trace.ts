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
        "invalid_api_key",
        "insufficient_quota",
        "rate_limit_exceeded",
        "content_filter",
        "server_error",
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

const networkCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

export function safeChatError(error: unknown) {
  const apiError = APICallError.isInstance(error) ? error : null;
  const parsed = requestError.safeParse(apiError?.data);
  let networkCode: string | undefined;
  let cause = error;
  for (let depth = 0; depth < 4 && cause instanceof Error; depth++) {
    if (
      "code" in cause &&
      typeof cause.code === "string" &&
      networkCodes.has(cause.code)
    ) {
      networkCode = cause.code;
      break;
    }
    cause = cause.cause;
  }
  return {
    upstreamStatus: apiError?.statusCode,
    retryable: apiError?.isRetryable,
    code: parsed.success ? parsed.data.error.code : undefined,
    param: parsed.success ? parsed.data.error.param : undefined,
    networkCode,
  };
}

type TraceValue = string | number | boolean | undefined;

export function createChatTrace() {
  const requestId = randomUUID();
  const started = performance.now();
  const headers = {
    "X-OCLR-Chat-Request-Id": requestId,
    "Cache-Control": "no-store",
  };
  const trace = (
    event: string,
    status?: number,
    details?: Record<string, TraceValue>,
  ) => {
    console.info(
      "[liru-chat]",
      JSON.stringify({
        requestId,
        event,
        status,
        ...details,
        durationMs: Math.round(performance.now() - started),
      }),
    );
  };
  function providerError(error: unknown) {
    const { code, param, ...details } = safeChatError(error);
    const status = details.upstreamStatus;
    trace(status === 400 ? "invalid_request" : "provider_error", status, {
      code,
      param,
      ...details,
    });
  }
  return { headers, trace, providerError };
}

export type ChatTrace = ReturnType<typeof createChatTrace>;
