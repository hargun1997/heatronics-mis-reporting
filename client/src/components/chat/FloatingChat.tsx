// Floating chat: "Ask the MIS", grounded in the LIVE deck (published history + live months with their completeness).
// Mounted once in the app shell. The deck code loads on the first open, not with every page. Reads only.
import { useCallback, useState } from 'react';
import { sendChat } from '../../data/chat/chatClient';
import { ChatPanel } from './ChatPanel';

const SUGGESTIONS = [
  'How much did we spend on Google, Meta and Amazon ads last month?',
  'Walk me down the P&L of the latest complete month.',
  'Which channel gave the most net revenue recently?',
  'Where is the biggest margin loss?',
];

export function FloatingChat() {
  const [context, setContext] = useState('');
  const load = useCallback(() => {
    void Promise.all([import('../../data/misDeck/liveDeck'), import('../../data/chat/misContext')])
      .then(async ([d, c]) => setContext(c.buildLiveMisContext(await d.loadLiveDeck().catch(() => null)).context))
      .catch(() => setContext('The MIS data did not load.'));
  }, []);
  return (
    <ChatPanel
      title="Ask the MIS"
      line="Reads the live P&L. It cannot change data."
      suggestions={SUGGESTIONS}
      emptyHint="Ask about revenue, margins, channels, ad spend or the P&L."
      placeholder="Ask about the numbers"
      working="Reading the MIS"
      onFirstOpen={load}
      ready={!!context}
      send={(next) => sendChat(context, next)}
    />
  );
}
