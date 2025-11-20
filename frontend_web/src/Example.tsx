import { Chat } from '@/components/Chat';
import { v4 as uuid } from 'uuid';
import z from 'zod/v4';
import { type MessageResponse } from './api/chat/types';
import { useChatContext } from '@/hooks/use-chat-context';
import { ChatSidebar } from '@/components/ChatSidebar';
import { useAgUiTool } from '@/hooks/use-ag-ui-tool';
import { ChatMessages } from '@/components/ChatMessages';
import { ChatProgress } from '@/components/ChatProgress';
import { ChatTextInput } from '@/components/ChatTextInput';
import { ChatError } from '@/components/ChatError';
import { ChatMessagesMemo } from '@/components/ChatMessage';
import {
  isErrorStateEvent,
  isMessageStateEvent,
  isStepStateEvent,
  isThinkingEvent,
} from '@/types/events.ts';
import { StepEvent } from '@/components/StepEvent.tsx';
import { ThinkingEvent } from '@/components/ThinkingEvent.tsx';

const initialMessages: MessageResponse[] = [
  {
    id: uuid(),
    role: 'assistant',
    content: {
      format: 2,
      parts: [
        {
          type: 'text',
          text: `Hi. Here you can test your agent based application.`,
        },
      ],
    },
    createdAt: new Date(),
  },
];

export function Example() {
  const {
    chatId,
    setChatId,
    sendMessage,
    userInput,
    setUserInput,
    combinedEvents,
    progress,
    setProgress,
    isLoadingHistory,
    isAgentRunning,
  } = useChatContext();

  useAgUiTool({
    name: 'alert',
    description: 'Action. Display an alert to user',
    handler: ({ message }) => alert(message),
    parameters: z.object({
      message: z.string().describe('The message which will be displayed to user'),
    }),
  });
  return (
    <div className="chat">
      <ChatSidebar chatId={chatId} setChatId={setChatId} />

      <Chat initialMessages={initialMessages}>
        <ChatMessages isLoading={isLoadingHistory} messages={combinedEvents}>
          {combinedEvents &&
            combinedEvents.map(m => {
              if (isErrorStateEvent(m)) {
                return <ChatError key={m.value.id} {...m.value} />;
              }
              if (isMessageStateEvent(m)) {
                return <ChatMessagesMemo key={m.value.id} {...m.value} />;
              }
              if (isStepStateEvent(m)) {
                return <StepEvent key={m.value.id} {...m.value} />;
              }
              if (isThinkingEvent(m)) {
                return <ThinkingEvent key={m.type} />;
              }
            })}
        </ChatMessages>
        <ChatProgress progress={progress || {}} setProgress={setProgress} />
        <ChatTextInput
          userInput={userInput}
          setUserInput={setUserInput}
          onSubmit={sendMessage}
          runningAgent={isAgentRunning}
        />
      </Chat>
    </div>
  );
}
