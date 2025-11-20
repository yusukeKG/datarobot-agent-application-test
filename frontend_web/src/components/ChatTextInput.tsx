import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dispatch, KeyboardEvent, SetStateAction, useRef } from 'react';

export interface ChatTextInputProps {
  onSubmit: (text: string) => any;
  userInput: string;
  setUserInput: Dispatch<SetStateAction<string>>;
  runningAgent: boolean;
}

export function ChatTextInput({
  onSubmit,
  userInput,
  setUserInput,
  runningAgent,
}: ChatTextInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function keyDownHandler(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) {
        const el = ref.current;
        e.preventDefault();
        if (el) {
          const start = el.selectionStart;
          const end = el.selectionEnd;

          const newValue = userInput.slice(0, start) + '\n' + userInput.slice(end);
          setUserInput(newValue);
        }
      } else {
        e.preventDefault();
        onSubmit(userInput);
      }
    }
  }

  return (
    <div className="chat-text-input relative">
      <Textarea
        ref={ref}
        value={userInput}
        onChange={e => setUserInput(e.target.value)}
        onKeyDown={keyDownHandler}
        className="pr-12 text-area"
      ></Textarea>
      <Button
        type="submit"
        onClick={() => onSubmit(userInput)}
        className="absolute bottom-2 right-2"
        size="icon"
        disabled={runningAgent}
      >
        <Send />
      </Button>
    </div>
  );
}
