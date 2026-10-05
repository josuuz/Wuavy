"use client";

import { createContext, useContext, useReducer, type ReactNode } from "react";

import {
  demoConversations,
  liveConversations,
  type Conversation,
  type ConversationStatus,
  type Message,
} from "@/lib/flow/conversations";
import type { ID } from "@/lib/flow/types";
import { useFlow } from "./store";

/*
  The conversations, held by the Pulse's shell rather than by the Conversas
  screen, so what was written, noted or scheduled there is still there after
  a visit to Vendas or the agenda. Only what belongs to the conversation
  lives here (its messages, status, owner, follow-up); everything about the
  person (stage, procedure, value, bookings) stays in the clinic's data
  (store.tsx), the one source the other screens read too.
*/

export interface Inbox {
  conversations: Conversation[];
  messages: Message[];
  seq: number;
}

export type InboxChange =
  | { type: "read"; id: ID }
  | { type: "write"; id: ID; text: string; note: boolean; now: string; authorId?: ID }
  | { type: "status"; id: ID; status: ConversationStatus }
  | { type: "followUp"; id: ID; at: string }
  | { type: "assign"; id: ID; userId: ID };

function change(state: Inbox, c: InboxChange): Inbox {
  const edit = (patch: (conv: Conversation) => Conversation) => ({
    ...state,
    conversations: state.conversations.map((conv) => (conv.id === c.id ? patch(conv) : conv)),
  });
  switch (c.type) {
    case "read":
      return edit((conv) => ({ ...conv, unread: 0 }));
    case "write": {
      const seq = state.seq + 1;
      // After everything already in the thread: the clinic's clock, a second per message.
      const at = new Date(Date.parse(c.now) + seq * 1000).toISOString();
      const message: Message = {
        id: `msg_local_${seq}`,
        conversationId: c.id,
        direction: c.note ? "note" : "out",
        text: c.text,
        at,
        status: c.note ? undefined : "enviada",
        authorId: c.authorId,
      };
      const next = { ...state, seq, messages: [...state.messages, message] };
      return c.note
        ? next
        : {
            ...next,
            conversations: next.conversations.map((conv) =>
              conv.id === c.id && conv.status === "aberta" ? { ...conv, status: "aguardando_cliente" } : conv,
            ),
          };
    }
    case "status":
      return edit((conv) => ({ ...conv, status: c.status }));
    case "followUp":
      return edit((conv) => ({ ...conv, followUpAt: c.at, status: "follow_up" }));
    case "assign":
      return edit((conv) => ({ ...conv, assignedUserId: c.userId }));
  }
}

const Context = createContext<{ inbox: Inbox; update: (c: InboxChange) => void } | null>(null);

export function InboxProvider({ children }: { children: ReactNode }) {
  const { data, live } = useFlow();
  const [inbox, update] = useReducer(change, null, () => ({
    ...(live ? liveConversations : demoConversations).load(data),
    seq: 0,
  }));
  return <Context value={{ inbox, update }}>{children}</Context>;
}

export function useInbox() {
  const value = useContext(Context);
  if (!value) throw new Error("useInbox outside InboxProvider");
  return value;
}
