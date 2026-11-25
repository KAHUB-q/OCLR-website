import { requireUser } from "@/lib/auth/user";
import { updateChatPromptWrite } from "@/lib/chat-prompt-contract";
import { updateChatPrompt } from "@/lib/chat-prompt-settings";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const saved = await updateChatPrompt(
      actor,
      await readJson(request, updateChatPromptWrite.maxBodyBytes),
    );
    return Response.json(saved, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
