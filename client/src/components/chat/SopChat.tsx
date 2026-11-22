// Handbook chat: "Ask about the handbook", shown on the Accounts Handbook pages. Grounded in the full handbook text
// (the same source the pages render), so the accountant and the CA can ask and get the chapter cited. Reads only.
import { handbookChatContext } from '../../data/handbook/handbook';
import { sendChat } from '../../data/chat/chatClient';
import { ChatPanel } from './ChatPanel';

const SUGGESTIONS = [
  'How does a Shopify COD order get cleared?',
  'Walk me through the daily push from Tranzact to Tally.',
  'What are the statutory dates in the monthly close?',
  'Why do we never fetch Easebuzz for the same dates twice?',
  'What does the monthly Amazon expense JV do?',
];

export function SopChat() {
  return (
    <ChatPanel
      title="Ask about the handbook"
      line="Reads the handbook and names the section. It cannot change data."
      suggestions={SUGGESTIONS}
      emptyHint="Ask about a task, a journal, a control ledger or a known issue."
      placeholder="Ask about the handbook"
      working="Reading the handbook"
      send={(next) => sendChat(handbookChatContext(), next, 'handbook')}
    />
  );
}
