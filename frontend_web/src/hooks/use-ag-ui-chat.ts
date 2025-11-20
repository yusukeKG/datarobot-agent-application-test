import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import {
  type RunAgentInput,
  type RunErrorEvent,
  type StateSnapshotEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type TextMessageStartEvent,
  type ToolCallEndEvent,
  type CustomEvent,
  type StepStartedEvent,
  type StepFinishedEvent,
} from '@ag-ui/core';
import type { AgentSubscriberParams } from '@ag-ui/client';

import { createAgent } from '@/lib/agent';
import {
  createCustomMessageWidget,
  createTextMessageFromAgUiEvent,
  createTextMessageFromUserInput,
  createToolMessageFromAgUiEvent,
  messageToStateEvent,
} from '@/lib/mappers';
import type { Tool, ToolSerialized } from '@/types/tools';
import type { ProgressState } from '@/types/progress';
import {
  isProgressDone,
  isProgressError,
  isProgressStart,
  type ChatStateEvent,
  type ChatStateEventByType,
} from '@/types/events';
import type { ChatProviderInput } from '@/components/ChatProvider';
import { MessageResponse } from '@/api/chat/types.ts';
import { useFetchHistory } from '@/api/chat';

export type UseAgUiChatParams = ChatProviderInput;

export function useAgUiChat({
  chatId,
  setChatId,
  agUiEndpoint,
  refetchChats = () => Promise.resolve(),
}: UseAgUiChatParams) {
  const [state, setState] = useState<Record<string, unknown>>({});
  const [events, setEvents] = useState<ChatStateEvent[]>([]);
  const [message, setMessage] = useState<MessageResponse | null>(null);
  const [userInput, setUserInput] = useState('');
  const [tools, setTools] = useState<Record<string, ToolSerialized>>({});
  const [initialMessages, setInitialMessages] = useState<MessageResponse[]>([]);
  const [initialState, setInitialState] = useState<Record<string, unknown>>({});
  const [progress, setProgress] = useState<ProgressState>({});
  const [isAgentRunning, setIsAgentRunning] = useState<boolean>(false);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const toolHandlersRef = useRef<
    Record<string, Pick<Tool, 'handler' | 'render' | 'renderAndWait'>>
  >({});

  const {
    data: history,
    isLoading: isLoadingHistory,
    refetch: refetchHistory,
  } = useFetchHistory({ chatId });

  const agent = useMemo(() => {
    return createAgent({ url: agUiEndpoint, threadId: chatId });
  }, [chatId, agUiEndpoint]);

  const agentRef = useRef(agent);
  const messageRef = useRef(message);
  const messagesRef = useRef(events);
  const toolsRef = useRef(tools);
  const unsubscribeRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    agentRef.current = agent;
    messageRef.current = message;
    messagesRef.current = events;
    toolsRef.current = tools;
  });

  useEffect(() => {
    setEvents([]);
    setMessage(null);
    setProgress({});
    setIsAgentRunning(false);
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      agent.abortController.abort();
    };
  }, [chatId]);

  async function sendMessage(message: string) {
    agent.messages = [{ id: uuid(), role: 'user', content: message }];

    const historyMessage = createTextMessageFromUserInput(message, chatId);
    setEvents(state => [...state, { type: 'message', value: historyMessage }]);
    setUserInput('');
    setIsAgentRunning(true);
    setIsThinking(true);

    const { unsubscribe } = agent.subscribe({
      onTextMessageStartEvent(params: { event: TextMessageStartEvent } & AgentSubscriberParams) {
        setMessage(createTextMessageFromAgUiEvent(params.event));
      },
      onTextMessageContentEvent(
        params: {
          event: TextMessageContentEvent;
          textMessageBuffer: string;
        } & AgentSubscriberParams
      ) {
        const { event, textMessageBuffer } = params;
        setIsThinking(false);
        setMessage(createTextMessageFromAgUiEvent(event, textMessageBuffer));
      },
      onTextMessageEndEvent(
        params: {
          event: TextMessageEndEvent;
          textMessageBuffer: string;
        } & AgentSubscriberParams
      ) {
        console.debug('onTextMessageEndEvent', params);
        setEvents(state => [...state, { type: 'message', value: messageRef.current! }]);
        setMessage(null);
      },
      onToolCallStartEvent() {
        setIsThinking(false);
      },
      onToolCallEndEvent(
        params: {
          event: ToolCallEndEvent;
          toolCallName: string;
          toolCallArgs: Record<string, unknown>;
        } & AgentSubscriberParams
      ) {
        console.debug('onToolCallArgsEvent', params);
        const tool = toolsRef.current[params.toolCallName];
        const toolHandler = toolHandlersRef.current[params.toolCallName];
        if (tool && toolHandler?.handler && params.toolCallArgs) {
          toolHandler.handler(params.toolCallArgs);
          setEvents(state => [
            ...state,
            {
              type: 'message',
              value: createToolMessageFromAgUiEvent(
                params.event,
                params.toolCallName,
                params.toolCallArgs
              ),
            },
          ]);
        } else if (tool && toolHandler?.render && params.toolCallArgs) {
          setEvents(state => [
            ...state,
            {
              type: 'message',
              value: createCustomMessageWidget({
                toolCallArgs: params.toolCallArgs,
                toolCallName: params.toolCallName,
                threadId: chatId,
              }),
            },
          ]);
        } else {
          setEvents(state => [
            ...state,
            {
              type: 'message',
              value: createToolMessageFromAgUiEvent(
                params.event,
                params.toolCallName,
                params.toolCallArgs
              ),
            },
          ]);
        }
      },
      onStateSnapshotEvent(params: { event: StateSnapshotEvent } & AgentSubscriberParams) {
        setState(params.state);
      },
      onStateChanged(params: Omit<AgentSubscriberParams, 'input'> & { input?: RunAgentInput }) {
        setIsThinking(false);
        setState(params.state);
      },
      onStepStartedEvent(params: { event: StepStartedEvent } & AgentSubscriberParams) {
        setIsThinking(false);
        setEvents(state => [
          ...state,
          {
            type: 'step',
            value: {
              id: uuid(),
              threadId: chatId,
              createdAt: new Date(),
              name: params.event.stepName,
              isRunning: true,
            },
          },
        ]);
      },
      onStepFinishedEvent(params: { event: StepFinishedEvent } & AgentSubscriberParams) {
        setEvents(state => {
          const runningStepIndex = state.findIndex(
            event => (event as ChatStateEventByType<'step'>).value.name === params.event.stepName
          );
          if (runningStepIndex === -1) {
            return state;
          }
          const runningStep = state[runningStepIndex] as ChatStateEventByType<'step'>;
          return [
            ...state.slice(0, runningStepIndex),
            {
              ...runningStep,
              value: {
                ...runningStep.value,
                isRunning: false,
              },
            },
            ...state.slice(runningStepIndex + 1),
          ];
        });
      },
      onRunFinishedEvent() {
        unsubscribe();
        unsubscribeRef.current = null;
        setIsAgentRunning(false);
        refetchChats();
      },
      onCustomEvent(params: { event: CustomEvent } & AgentSubscriberParams) {
        const event = params.event;
        setIsThinking(false);

        if (isProgressStart(event)) {
          setProgress(state => ({
            ...state,
            [event.value.id]: event.value.steps,
          }));
        } else if (isProgressDone(event)) {
          setProgress(state => ({
            ...state,
            [event.value.id]: state[event.value.id].map((s, i) =>
              event.value.step === i ? { ...s, done: true } : s
            ),
          }));
        } else if (isProgressError(event)) {
          setProgress(state => ({
            ...state,
            [event.value.id]: state[event.value.id].map((s, i) =>
              event.value.step === i ? { ...s, error: event.value.message } : s
            ),
          }));
        }
      },
      onRunErrorEvent(params: { event: RunErrorEvent } & AgentSubscriberParams) {
        setIsAgentRunning(false);
        setIsThinking(false);
        if (params.event.rawEvent?.name === 'AbortError') {
          return;
        }
        setEvents(state => [
          ...state,
          {
            type: 'error',
            value: {
              id: uuid(),
              threadId: chatId,
              createdAt: new Date(),
              error: params.event.message,
            },
          },
        ]);
      },
    });

    unsubscribeRef.current = unsubscribe;

    const result = await agent.runAgent({
      tools: Object.values(tools).filter(tool => tool.enabled !== false),
    });

    console.debug('runAgent result', result);
  }

  const combinedEvents: ChatStateEvent[] = useMemo(() => {
    const result: ChatStateEvent[] =
      !isLoadingHistory && !history?.length && initialMessages
        ? [...initialMessages.map(messageToStateEvent)]
        : [];
    if (history) {
      result.push(...history.map(messageToStateEvent));
    }
    result.push(...events);
    if (message) {
      result.push(messageToStateEvent(message));
    }
    if (isThinking) {
      result.push({
        type: 'thinking',
      });
    }
    return result;
  }, [history, events, message, isLoadingHistory]);

  function registerOrUpdateTool(id: string, tool: ToolSerialized) {
    setTools(state => ({
      ...state,
      [id]: tool,
    }));
  }

  function updateToolHandler(
    name: string,
    handler: Pick<Tool, 'handler' | 'render' | 'renderAndWait'>
  ) {
    toolHandlersRef.current[name] = handler;
  }

  function removeTool(name: string) {
    setTools(state => {
      const copy = { ...state };
      delete copy[name];
      return copy;
    });
    delete toolHandlersRef.current[name];
  }

  function getTool(
    name: string
  ): (ToolSerialized & Pick<Tool, 'handler' | 'render' | 'renderAndWait'>) | null {
    if (tools[name] && toolHandlersRef.current[name]) {
      return {
        ...tools[name],
        ...toolHandlersRef.current[name],
      };
    }

    return null;
  }

  return {
    agent,
    /*state*/
    state,
    setState,
    chatId,
    setChatId,
    events,
    setEvents,
    message,
    combinedEvents,
    setMessage,
    userInput,
    setUserInput,
    initialMessages,
    setInitialMessages,
    initialState,
    setInitialState,
    progress,
    setProgress,
    isAgentRunning,
    setIsAgentRunning,
    isThinking,
    setIsThinking,
    /*methods*/
    sendMessage,
    registerOrUpdateTool,
    updateToolHandler,
    removeTool,
    getTool,
    /*resolver*/
    useFetchHistory,
    isLoadingHistory,
    refetchHistory,
  };
}
