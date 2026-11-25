import { db } from "@/db";
import { chatPromptEvents, chatPromptSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { User } from "./auth/sessions";
import {
  assertCapability,
  assertUserWriteChannel,
  hasCapability,
} from "./auth/staff";
import { updateChatPromptWrite } from "./chat-prompt-contract";
import { remoteMode } from "./data-source";
import { HttpError } from "./http-error";
import { inReadChannel } from "./read-channel";

const fields = {
  prompt: chatPromptSettings.prompt,
  revision: chatPromptSettings.revision,
};

export async function readChatPrompt() {
  const [saved] = await db()
    .select(fields)
    .from(chatPromptSettings)
    .where(eq(chatPromptSettings.id, 1));
  return saved ?? { prompt: "", revision: 0 };
}

export async function chatPromptForAdmin(actor: User) {
  if (
    remoteMode() ||
    inReadChannel() ||
    !(await hasCapability(actor, "configure_tournament"))
  )
    return null;
  return readChatPrompt();
}

export async function updateChatPrompt(actor: User, input: unknown) {
  assertUserWriteChannel();
  await assertCapability(actor, "configure_tournament");
  const parsed = updateChatPromptWrite.request.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Enter a valid custom prompt.");
  const { prompt, expectedRevision } = parsed.data;
  return db().transaction(async (tx) => {
    await tx.insert(chatPromptSettings).values({ id: 1 }).onConflictDoNothing();
    const [before] = await tx
      .select(fields)
      .from(chatPromptSettings)
      .where(eq(chatPromptSettings.id, 1))
      .for("update");
    await assertCapability(actor, "configure_tournament", undefined, tx);
    if (before.revision !== expectedRevision)
      throw new HttpError(
        409,
        "Website settings changed. Refresh before saving.",
      );
    if (before.prompt === prompt) return before;
    const [saved] = await tx
      .update(chatPromptSettings)
      .set({ prompt, revision: before.revision + 1 })
      .where(eq(chatPromptSettings.id, 1))
      .returning(fields);
    await tx.insert(chatPromptEvents).values({
      actorId: actor.osuId,
      beforeLength: before.prompt.length,
      afterLength: saved.prompt.length,
      revision: saved.revision,
    });
    return saved;
  });
}
