// Chat client — relay a turn (with the MIS context) to /api/chat.

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// One request per 5 minutes for the whole tab: the sidebar pill and the floating chat both ask on every page load.
let statusMemo: { at: number; p: Promise<{ configured: boolean }> } | null = null;
export function chatStatus(): Promise<{ configured: boolean }> {
  if (statusMemo && Date.now() - statusMemo.at < 300_000) return statusMemo.p;
  const p = fetch('/api/chat/status').then(async (res) => (await res.json().catch(() => ({ configured: false }))) as { configured: boolean });
  const entry = { at: Date.now(), p };
  statusMemo = entry;
  p.catch(() => { if (statusMemo === entry) statusMemo = null; });
  return p;
}

/** Which grounded persona the server should frame the turn with. */
export type ChatMode = 'mis' | 'handbook';

export async function sendChat(
  context: string,
  messages: ChatMessage[],
  mode: ChatMode = 'mis'
): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, messages, mode }),
  });
  const body = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
  if (!res.ok) throw new Error(body.error || `Chat failed (${res.status}).`);
  return body.reply || '';
}
