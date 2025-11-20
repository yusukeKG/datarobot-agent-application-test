import type { InfiniteData } from '@tanstack/react-query';
import { APIChat, ChatListItem, MessagePage } from './types';

export function selectChats(res: { data: APIChat[] }): ChatListItem[] {
  return res.data.map(chat => ({
    id: chat.thread_id,
    name: chat.name,
    userId: chat.user_id,
    createdAt: new Date(chat.created_at),
    updatedAt: chat.update_time ? new Date(chat.update_time) : null,
    metadata: chat.metadata,
  }));
}
export function selectMessages(res: InfiniteData<MessagePage, number>) {
  return res.pages.flatMap(page => page.messages);
}
