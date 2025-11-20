import type { MastraMessageV2 } from '@mastra/core';
import { APIChat, APIChatWithMessages, MessagePage } from './types';
import apiClient from '../apiClient';

export async function getChats({ signal }: { signal: AbortSignal }) {
  return apiClient.get<APIChat[]>('v1/chat', { signal });
}

export async function deleteChat({ chatId }: any): Promise<void> {
  await apiClient.delete(`v1/chat/${chatId}`);
}

export async function updateChat({
  chatId,
  name,
}: {
  chatId: string;
  name: string;
}): Promise<void> {
  await apiClient.patch(`v1/chat/${chatId}`, { name });
}

export async function getChatHistory({
  signal,
  chatId,
}: {
  signal: AbortSignal;
  chatId: string;
}): Promise<MessagePage> {
  const response = await apiClient.get<APIChatWithMessages>(`v1/chat/${chatId}`, { signal });
  const mastraMessages = [];
  for (const aguiMessage of response.data.messages) {
    const mastraMessage: MastraMessageV2 = {
      id: aguiMessage.id,
      role:
        aguiMessage.role == 'developer' || aguiMessage.role == 'tool' ? 'system' : aguiMessage.role,
      createdAt: aguiMessage?.timestamp ? new Date(aguiMessage.timestamp) : new Date(1678886400000),
      content: {
        format: 2,
        parts: [{ type: 'text', text: aguiMessage.content || '' }],
        content: aguiMessage.content,
      },
    };
    mastraMessages.push(mastraMessage);
  }
  return { messages: mastraMessages };
}
