import type { PodMessage } from "@/lib/pods/types";

export type ChatPerson = { id: string; full_name: string; photo_url: string | null };

// A pod message plus who sent it (null for system messages).
export type ChatMessage = PodMessage & { sender: ChatPerson | null };

export type ChatMember = ChatPerson & { role: "driver" | "rider"; status: string };

export type ChatState = {
  messages: ChatMessage[];
  members: ChatMember[];
  canPost: boolean;
};

export const MAX_MESSAGE_LENGTH = 2000;
