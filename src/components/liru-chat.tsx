"use client";
import Markdown from "react-markdown";
import type { Root, Parents, PhrasingContent } from "mdast";
import { useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type SourceMessagePartProps,
  type TextMessagePartProps,
  useAuiState,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/ai-sdk";
import { useAppTranslations } from "@/i18n/shared";
import { LiruChatIcon } from "./liru-chat-icon";
import styles from "./liru-chat.module.css";

function Source(part: SourceMessagePartProps) {
  if (part.sourceType !== "url") return null;
  return (
    <a className="text-link" href={part.url}>
      [{part.id}] {part.title}
    </a>
  );
}
// Link numbered references only to sources received for this assistant message.
function AnswerText({ text }: TextMessagePartProps) {
  const parts = useAuiState((state) => state.message.parts);
  const sources = new Map(
    parts.flatMap((part) =>
      part.type === "source" && part.sourceType === "url"
        ? [[part.id, part.url] as const]
        : [],
    ),
  );
  function citations() {
    function walk(parent: Parents) {
      for (let i = parent.children.length - 1; i >= 0; i--) {
        const child = parent.children[i];
        if (child.type === "link" || child.type === "linkReference") continue;
        if ("children" in child) walk(child);
        if (child.type !== "text") continue;
        const nodes: PhrasingContent[] = [];
        let end = 0;
        for (const match of child.value.matchAll(/\[(\d+)\]/g)) {
          const url = sources.get(match[1]);
          if (!url) continue;
          if (match.index > end)
            nodes.push({
              type: "text",
              value: child.value.slice(end, match.index),
            });
          nodes.push({
            type: "link",
            url,
            children: [{ type: "text", value: match[0] }],
          });
          end = match.index + match[0].length;
        }
        if (end) {
          nodes.push({ type: "text", value: child.value.slice(end) });
          parent.children.splice(i, 1, ...nodes);
        }
      }
    }
    return (tree: Root) => walk(tree);
  }
  return (
    <div className={styles.markdown}>
      <Markdown
        skipHtml
        remarkPlugins={[citations]}
        components={{
          img: () => null,
          a: ({ href, children }) =>
            href && [...sources.values()].includes(href) ? (
              <a className="text-link" href={href}>
                {children}
              </a>
            ) : (
              <>{children}</>
            ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
function AssistantMessage() {
  return (
    <MessagePrimitive.Root className={styles.reply}>
      <LiruChatIcon />
      <div className={styles.parts}>
        <MessagePrimitive.Parts components={{ Source, Text: AnswerText }} />
      </div>
    </MessagePrimitive.Root>
  );
}
function UserMessage() {
  return (
    <MessagePrimitive.Root className={styles.question}>
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}

export function LiruChat({ edition }: { edition: string }) {
  const tr = useAppTranslations();
  const locale = tr.locale;
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            edition,
            locale,
            questions: messages
              .filter((m) => m.role === "user")
              .slice(-4)
              .map((m) =>
                m.parts
                  .filter((p) => p.type === "text")
                  .map((p) => p.text)
                  .join("\n"),
              ),
          },
        }),
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (!response.ok) throw new Error(String(response.status));
          return response;
        },
      }),
    [edition, locale],
  );
  const chat = useChat({ id: edition, transport });
  const runtime = useAISDKRuntime(chat);
  const busy = chat.status === "submitted" || chat.status === "streaming";
  const last = chat.messages.at(-1);
  const waiting =
    busy &&
    (chat.status === "submitted" ||
      last?.role !== "assistant" ||
      !last.parts.some((part) => part.type === "text" && part.text.trim()));
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className={styles.chat}>
        <ThreadPrimitive.Viewport
          className={styles.history}
          role="log"
          aria-label={tr("Conversation")}
        >
          <ThreadPrimitive.Messages
            components={{ AssistantMessage, UserMessage }}
          />
          {waiting && (
            <div role="status" className={styles.pending}>
              {tr("Loading…")}
            </div>
          )}
        </ThreadPrimitive.Viewport>
        {chat.error && (
          <div role="alert" className="notice">
            {chat.error.message === "401" ? (
              <a href={`/auth/osu?chat_edition=${encodeURIComponent(edition)}`}>
                {tr("Sign in to ask Liru")}
              </a>
            ) : chat.error.message === "429" ? (
              tr("Please wait a minute before asking again.")
            ) : (
              tr("Liru could not finish the answer. Please try again.")
            )}
          </div>
        )}
        <ComposerPrimitive.Root className={styles.composer}>
          <div className={styles.suggestions}>
            {[
              tr("How many players are there?"),
              tr("How many upcoming matches are there?"),
              tr("How many HD maps are there?"),
            ].map((question) => (
              <ThreadPrimitive.Suggestion
                key={question}
                type="button"
                className="secondary"
                prompt={question}
                send
                clearComposer={false}
                disabled={busy || chat.error?.message === "401"}
              >
                {question}
              </ThreadPrimitive.Suggestion>
            ))}
          </div>
          <ComposerPrimitive.Input
            aria-label={tr("Ask Liru")}
            placeholder={tr("Ask about this season…")}
            maxLength={1500}
            rows={2}
          />
          <div className="actions">
            {busy ? (
              <ComposerPrimitive.Cancel>{tr("Stop")}</ComposerPrimitive.Cancel>
            ) : (
              <ComposerPrimitive.Send>{tr("Send")}</ComposerPrimitive.Send>
            )}
            {!busy &&
              chat.messages.length > 0 &&
              chat.error?.message !== "401" && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void chat.regenerate()}
                >
                  {tr("Try again")}
                </button>
              )}
          </div>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
