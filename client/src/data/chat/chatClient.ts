// Chat client — relay a turn (with the MIS context) to /api/chat.

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function chatStatus(): Promise<{ configured: boolean }> {
  const res = await fetch('/api/chat/status');
  return (await res.json().catch(() => ({ configured: false }))) as { configured: boolean };
}

export async function sendChat(context: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, messages }),
  });
  const body = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
  if (!res.ok) throw new Error(body.error || `Chat failed (${res.status}).`);
  return body.reply || '';
}
