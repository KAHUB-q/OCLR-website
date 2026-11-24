import { requireBrowserSession } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { chatConfiguration } from "@/lib/chat-config";
import { chatAnswer } from "@/lib/chat-answer";
import { chatWrite } from "@/lib/chat-write-contract";
import { chatEvidence } from "@/lib/chat-sources";
import { DeveloperApiError, DeveloperApiLimiter } from "@/lib/developer-api";

const limiter = new DeveloperApiLimiter();

export async function POST(request: Request) {
  try {
    const session = await requireBrowserSession();
    requireSameOrigin(request);
    const config = chatConfiguration();
    if (!config)
      return Response.json({ error: "Chat is unavailable." }, { status: 503 });
    const input = chatWrite.request.safeParse(
      await readJson(request, chatWrite.maxBodyBytes),
    );
    if (!input.success)
      return Response.json({ error: "Invalid chat request." }, { status: 400 });
    const { edition, locale, questions } = input.data;
    limiter.take(String(session.osuId), 8);
    const question = questions.at(-1)!;
    const evidence = await chatEvidence(
      edition,
      question,
      questions.at(-2) ?? "",
      Date.now(),
      request.signal,
    );
    request.signal.throwIfAborted();
    return chatAnswer({
      config,
      evidence,
      locale,
      questions,
      signal: request.signal,
    });
  } catch (error) {
    if (error instanceof DeveloperApiError && error.status === 429)
      return Response.json(
        { error: "Too many chat requests." },
        {
          status: 429,
          headers: { "Retry-After": "60" },
        },
      );
    return apiError(error);
  }
}
