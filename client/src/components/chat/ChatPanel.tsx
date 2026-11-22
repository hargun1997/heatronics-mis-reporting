// The AI assistant (GUIDE.md "The AI assistant"): ONE button at the bottom right opens the chat as a drawer.
// It reads only. Suggested questions show while the chat is empty. FloatingChat (the MIS) and SopChat (the handbook)
// are thin wrappers that give it their context and words.
import { useEffect, useRef, useState } from 'react';
import { MessageSquare, SendHorizontal } from 'lucide-react';
import { chatStatus, type ChatMessage } from '../../data/chat/chatClient';
import { Markdown } from '../ui/Markdown';
import { Drawer } from '../ui/overlays';
import { Button } from '../ui/Button';

export interface ChatPanelProps {
  /** Button name and drawer title ("Ask the MIS"). */
  title: string;
  /** One line under the title. */
  line: string;
  suggestions: string[];
  /** Shown above the suggestions while the chat is empty. */
  emptyHint: string;
  placeholder: string;
  /** Shown while the answer comes ("Reading the MIS"). */
  working: string;
  /** Called once, when the drawer first opens (load the context here). */
  onFirstOpen?: () => void;
  /** False while the context still loads. */
  ready?: boolean;
  send: (messages: ChatMessage[]) => Promise<string>;
}

export function ChatPanel({ title, line, suggestions, emptyHint, placeholder, working, onFirstOpen, ready = true, send }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loadedOnce) return;
    setLoadedOnce(true);
    onFirstOpen?.();
    chatStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, [open, loadedOnce, onFirstOpen]);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, loading, open]);

  const off = configured === false;
  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || loading || off || !ready) return;
    setError(null);
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      setMessages([...next, { role: 'assistant', content: await send(next) }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The answer did not come. Try again.');
      setMessages(next);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={title}
        title={title}
        className="fixed bottom-5 right-5 z-sticky flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-pop hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 print:hidden"
      >
        <MessageSquare className="h-5 w-5" strokeWidth={1.8} aria-hidden />
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} title={title} subtitle={line} width={420}
        footer={
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void ask(input); }}>
            <label htmlFor="chat-input" className="sr-only">Question</label>
            <textarea
              id="chat-input"
              data-autofocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input); } }}
              rows={1}
              placeholder={off ? 'Chat is not connected' : placeholder}
              disabled={off || loading}
              className="max-h-28 min-h-10 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:bg-slate-50"
            />
            <Button type="submit" variant="primary" aria-label="Send" disabled={!input.trim() || loading || off}
              icon={<SendHorizontal className="h-4 w-4" aria-hidden />} />
          </form>
        }>
        <div className="space-y-3 p-4">
          {off && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-label text-slate-700">
              Chat is not connected. Set <span className="font-mono">ANTHROPIC_API_KEY</span> on the server.
            </p>
          )}
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-label text-slate-600">{emptyHint}</p>
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => void ask(s)} disabled={off}
                  className="block min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-label text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div className={m.role === 'user'
                ? 'max-w-[85%] whitespace-pre-wrap rounded-lg bg-slate-900 px-3 py-2 text-sm text-white'
                : 'max-w-[92%] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2'}>
                {m.role === 'user' ? m.content : <Markdown text={m.content} />}
              </div>
            </div>
          ))}
          {loading && <p role="status" className="text-label text-slate-600">{working}</p>}
          {error && <p role="alert" className="px-1 text-label text-red-700">{error}</p>}
          <div ref={endRef} />
        </div>
      </Drawer>
    </>
  );
}
