import type { MastraMessageV2 } from '@mastra/core';
import type { Message } from '@ag-ui/core';

// TODO: This awkwardly shoves AGUI message list into the Mastra format.
// I didn't want to completely rewrite the UI, still figuring out where to go here.

export interface ChatListItem {
  id: string;
  userId: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date | null;
  metadata?: Record<string, unknown>;
}

export type MessageResponse = MastraMessageV2;

export type MessagePage = {
  messages: MessageResponse[];
};

export type APIChat = {
  name: string;
  thread_id: string;
  user_id: string;
  created_at: string;
  update_time: string;
  metadata?: Record<string, unknown>;
};

export type APIChatWithMessages = APIChat & {
  messages: Message[];
};
